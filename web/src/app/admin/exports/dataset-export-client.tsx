'use client';

import { useState } from 'react';
import { Calendar, Download, Eye, Filter, Loader2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import type { DatasetType, PreviewResult } from '@/lib/dataset-export';

interface DatasetFilters {
  startDate?: string;
  endDate?: string;
  quality?: string | null;
  scope?: 'unexported' | 'all';
}

type DatasetPreview = Extract<PreviewResult, { totalCount: number }> & {
  poemDistribution: Array<{ title: string; count: number }>;
  coverage: {
    eligibleRecords: number;
    validRecords: number;
    invalidRecords: number;
    sampleLimit: number;
  };
};

export default function DatasetExportClient() {
  const [type, setType] = useState<DatasetType>('sft');
  const [filters, setFilters] = useState<DatasetFilters>({ scope: 'unexported' });
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const requestExport = async (previewOnly: boolean) => {
    if (previewOnly) {
      setLoading(true);
      setPreview(null);
    } else {
      setExporting(true);
    }
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/datasets/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, filters, preview: previewOnly }),
      });
      const data = await response.json();
      if (!response.ok || 'error' in data) {
        setError(data.error || '请求失败');
        return;
      }
      if (previewOnly) {
        setPreview(data);
      } else {
        setSuccess(`成功导出 ${data.recordCount} 条记录`);
        if (data.downloadUrl) window.location.href = data.downloadUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络请求失败');
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
        description="预览返回前 100 条、篇目分布和样本覆盖率。"
        icon={<Filter className="size-5" />}
        className="max-w-3xl"
        footer={(
          <>
            <Button variant="outline" onClick={() => requestExport(true)} disabled={loading || exporting}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Eye className="mr-2 size-4" />}
              预览前 100 条
            </Button>
            <Button onClick={() => requestExport(false)} disabled={loading || exporting || !preview || preview.coverage.validRecords === 0}>
              {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              导出 JSONL
            </Button>
          </>
        )}
      >
          <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>数据集类型</Label>
              <Select value={type} onValueChange={(value) => setType(value as DatasetType)}>
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
              <Select value={filters.scope ?? 'unexported'} onValueChange={(value) => setFilters({ ...filters, scope: value === 'all' ? 'all' : 'unexported' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unexported">默认：尚未导出过</SelectItem>
                  <SelectItem value="all">全部历史样本</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>质量等级</Label>
              <Select value={filters.quality || 'all'} onValueChange={(value) => setFilters({ ...filters, quality: value === 'all' ? null : value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="high">高质量</SelectItem>
                  <SelectItem value="medium">中等质量</SelectItem>
                  <SelectItem value="low">低质量</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Calendar className="size-4" />开始日期</Label>
              <Input type="date" value={filters.startDate || ''} onChange={(e) => setFilters({ ...filters, startDate: e.target.value || undefined })} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Calendar className="size-4" />结束日期</Label>
              <Input type="date" value={filters.endDate || ''} onChange={(e) => setFilters({ ...filters, endDate: e.target.value || undefined })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            先预览样本再导出；默认只导出尚未导出过的可导出样本，可切换为全部历史样本再次生成新批次。
          </p>
          </div>
      </AdminDialogShell>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>导出失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertTitle>导出成功</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>数据预览</CardTitle>
            <CardDescription>共 {preview.totalCount} 条{filters.scope === 'all' ? '历史' : '尚未导出'}可导出候选，展示 {preview.sampleRecords.length} 条有效样本。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Badge variant="outline">候选 {preview.coverage.eligibleRecords}</Badge>
              <Badge variant="secondary">有效 {preview.coverage.validRecords}</Badge>
              <Badge variant={preview.coverage.invalidRecords > 0 ? 'destructive' : 'outline'}>无效 {preview.coverage.invalidRecords}</Badge>
              <Badge variant="outline">limit {preview.coverage.sampleLimit}</Badge>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>篇目</TableHead>
                    <TableHead>样本数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.poemDistribution.length === 0 ? (
                    <TableRow><TableCell colSpan={2}>暂无篇目分布</TableCell></TableRow>
                  ) : (
                    preview.poemDistribution.map((item) => (
                      <TableRow key={item.title}>
                        <TableCell>{item.title}</TableCell>
                        <TableCell>{item.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3">
              {preview.sampleRecords.map((record, index) => (
                <div key={index} className="rounded-lg border bg-muted/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">样本 #{index + 1}</span>
                    <span className="text-xs text-muted-foreground">{type.toUpperCase()} 格式</span>
                  </div>
                  <Textarea value={JSON.stringify(record, null, 2)} readOnly className="font-mono text-xs" rows={type === 'sft' ? 12 : type === 'dpo' ? 7 : 10} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
