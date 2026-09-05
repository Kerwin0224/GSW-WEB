import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminExports } from '@/lib/data/admin';
import DatasetExportClient from './dataset-export-client';

export default async function AdminExportsPage() {
  const result = await getAdminExports();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="教学数据导出加载失败" description={result.message} />
      </div>
    );
  }

  const { approved, history } = result.data as {
    approved: Array<unknown>;
    history: Array<{ id: string; export_type: string; record_count: number; status: string; created_at: string }>;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="教学数据导出"
        title="只把教师核实过的学习记录带出系统。"
        description="这里把已确认无误或已修订的学习记录整理成教学数据导出批次，支持按时间、项目、教师等维度筛选并导出 SFT、DPO JSONL。"
        metrics={[
          { label: '可导出', value: approved.length, hint: '每条回答只取最新可导出版本' },
          { label: '历史批次', value: history.length, hint: 'export_batches' },
          { label: '格式', value: 'SFT/DPO', hint: '按样本类型输出' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="教学数据导出"
          title="教学数据导出"
          description="设置筛选条件，预览真实学习记录样本，再导出 SFT/DPO JSONL。"
        />
        <DatasetExportClient />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="导出历史"
          title="导出历史"
          description="查看历史教学数据导出批次记录。"
        />
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>批次 ID</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>记录数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState title="暂无导出记录" description="完成首次数据集导出后，历史记录将显示在这里。" />
                  </TableCell>
                </TableRow>
              ) : (
                history.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-mono text-xs">{batch.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{batch.export_type.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>{batch.record_count}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          batch.status === 'ready'
                            ? 'default'
                            : batch.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(batch.created_at).toLocaleString('zh-CN')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
