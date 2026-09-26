'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Calendar, CheckCircle2, Eye, Filter, Info, Loader2, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import type { DatasetType, PreviewResult } from '@/lib/dataset-export-record';
import { BatchDownloadButton } from './batch-download-button';

interface DatasetFilters {
  startDate?: string;
  endDate?: string;
  quality?: string | null;
  scope?: 'unexported' | 'all';
}

type DatasetPreview = Extract<PreviewResult, { totalCount: number }>;

/** 弹窗内的结果分级：空结果是中性提示，不是"导出成功"。 */
type Outcome = { tone: 'info' | 'success' | 'error'; title: string; message: string } | null;

export default function DatasetExportClient() {
  const router = useRouter();
  const [type, setType] = useState<DatasetType>('sft');
  const [filters, setFilters] = useState<DatasetFilters>({ scope: 'unexported' });
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  const changeType = (value: string | null) => {
    if (value !== 'sft' && value !== 'dpo' && value !== 'metadata') return;
    setType(value);
    setPreview(null);
    setOutcome(null);
  };

  const changeFilters = (nextFilters: DatasetFilters) => {
    setFilters(nextFilters);
    setPreview(null);
    setOutcome(null);
  };

  const requestExport = async (previewOnly: boolean) => {
    if (previewOnly) {
      setLoading(true);
      setPreview(null);
    } else {
      setExporting(true);
    }
    setOutcome(null);

    try {
      const response = await fetch('/api/admin/datasets/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, filters, preview: previewOnly }),
      });
      const data = await response.json();
      // 空结果不是故障：服务端返回 200 + empty，按中性提示呈现。
      if (data.empty) {
        setOutcome({ tone: 'info', title: '没有可导出的记录', message: data.error || '当前筛选条件下没有可导出的记录' });
        return;
      }
      if (!response.ok || 'error' in data) {
        const failure = data.error || '请求失败';
        setOutcome({ tone: 'error', title: '导出失败', message: data.resolution ? `${failure}。处理建议：${data.resolution}` : failure });
        return;
      }
      if (previewOnly) {
        setPreview(data);
        setOutcome({ tone: 'info', title: '预览已生成', message: `候选 ${data.coverage.eligibleRecords} 条，其中有效 ${data.coverage.validRecords} 条。确认无误后再生成批次。` });
      } else {
        setLastBatchId(data.batchId ?? null);
        setPreview(null);
        setOutcome({
          tone: 'success',
          title: '导出成功',
          message: `成功导出 ${data.recordCount} 条记录，批次 ${data.batchId}。可在下方下载，或到本页"导出历史"随时重下。`,
        });
        // 历史表格在页面下方；成功后刷新，让新批次立刻出现在列表里。
        router.refresh();
      }
    } catch (err) {
      setOutcome({ tone: 'error', title: '导出失败', message: err instanceof Error ? err.message : '网络请求失败' });
    } finally {
      setLoading(false);
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminDialogShell
        trigger={
          <Button>
            <Filter className="mr-2 size-4" />
            配置导出
          </Button>
        }
        title="筛选与预览"
        description="修改类型或筛选条件后需要重新预览；确认导出才会创建 JSONL 文件与批次记录。"
        icon={<Filter className="size-5" />}
        className="max-w-3xl"
        footer={(
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {outcome ? (
              <span className={`mr-auto text-xs ${outcome.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {outcome.title}
              </span>
            ) : null}
            {lastBatchId ? <BatchDownloadButton batchId={lastBatchId} label="下载本批次" variant="secondary" /> : null}
            <Button variant="outline" onClick={() => requestExport(true)} disabled={loading || exporting}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Eye className="mr-2 size-4" />}
              预览样本
            </Button>
            <Button onClick={() => requestExport(false)} disabled={loading || exporting || !preview || preview.coverage.validRecords === 0}>
              {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              生成批次
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>数据集类型</Label>
              <Select value={type} onValueChange={changeType} disabled={loading || exporting}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sft">SFT JSONL</SelectItem>
                  <SelectItem value="dpo">DPO JSONL</SelectItem>
                  <SelectItem value="metadata">审阅元数据 JSONL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>导出范围</Label>
              <Select value={filters.scope ?? 'unexported'} disabled={loading || exporting} onValueChange={(value) => changeFilters({ ...filters, scope: value === 'all' ? 'all' : 'unexported' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unexported">默认：尚未导出过</SelectItem>
                  <SelectItem value="all">全部历史样本</SelectItem>
                </SelectContent>
              </Select>
              {type === 'metadata' ? <p className="text-xs text-muted-foreground">审阅元数据始终包含全部历史样本，不受导出范围影响。</p> : null}
            </div>
            <div className="space-y-2">
              <Label>核实质量</Label>
              <Select value={filters.quality || 'all'} disabled={loading || exporting} onValueChange={(value) => changeFilters({ ...filters, quality: value === 'all' ? null : value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {/* 选项与 audit_records.quality 的真实枚举一致（teacher-actions 写入端）：
                      accurate/needs_correction/conversation_finalized。曾经的 high/medium/low
                      在库里不存在，选了永远筛出 0 条。 */}
                  <SelectItem value="accurate">确认无误</SelectItem>
                  <SelectItem value="needs_correction">修订后采纳</SelectItem>
                  <SelectItem value="conversation_finalized">会话整体确认</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Calendar className="size-4" />开始日期</Label>
              <Input type="date" disabled={loading || exporting} value={filters.startDate || ''} onChange={(event) => changeFilters({ ...filters, startDate: event.target.value || undefined })} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Calendar className="size-4" />结束日期</Label>
              <Input type="date" disabled={loading || exporting} value={filters.endDate || ''} onChange={(event) => changeFilters({ ...filters, endDate: event.target.value || undefined })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            先预览样本再导出；默认只导出尚未导出过的可导出样本，可切换为全部历史样本再次生成新批次。
          </p>

          {outcome ? (
            <Alert variant={outcome.tone === 'error' ? 'destructive' : 'default'} role={outcome.tone === 'error' ? 'alert' : 'status'}>
              {outcome.tone === 'error' ? <XCircle className="size-4" /> : outcome.tone === 'success' ? <CheckCircle2 className="size-4" /> : <Info className="size-4" />}
              <AlertTitle>{outcome.title}</AlertTitle>
              <AlertDescription>{outcome.message}</AlertDescription>
            </Alert>
          ) : null}

          {preview ? (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline">候选 {preview.coverage.eligibleRecords}</Badge>
                <Badge variant="secondary">有效 {preview.coverage.validRecords}</Badge>
                <Badge variant={preview.coverage.invalidRecords > 0 ? 'destructive' : 'outline'}>无效 {preview.coverage.invalidRecords}</Badge>
                <Badge variant="outline">预览上限 {preview.coverage.sampleLimit}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                共 {preview.totalCount} 条{filters.scope === 'all' ? '历史' : '尚未导出'}可导出候选，下面展示 {preview.sampleRecords.length} 条有效样本。
              </p>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>项目</TableHead>
                      <TableHead>样本数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.projectDistribution.length === 0 ? (
                      <TableRow><TableCell colSpan={2}>暂无项目分布</TableCell></TableRow>
                    ) : (
                      preview.projectDistribution.map((item) => (
                        <TableRow key={item.name}>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.count}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3">
                {preview.sampleRecords.map((record, index) => (
                  <div key={'metadata' in record ? record.metadata.sampleId : record.sampleId} className="rounded-lg border bg-muted/30 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">样本 #{index + 1}</span>
                      <span className="text-xs text-muted-foreground">{type.toUpperCase()} 格式</span>
                    </div>
                    <Textarea value={JSON.stringify(record, null, 2)} readOnly className="font-mono text-xs" rows={type === 'sft' ? 12 : type === 'dpo' ? 7 : 10} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </AdminDialogShell>
    </div>
  );
}
