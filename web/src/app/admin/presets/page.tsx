import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPromptPresetDialog } from '@/components/workbench/admin-prompt-preset-form';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminPresets } from '@/lib/data/admin';

export default async function AdminPresetsPage() {
  const result = await getAdminPresets();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="Prompt 预设加载失败" description={result.message} />
      </div>
    );
  }

  const presets = result.data as Array<{ id: string; title: string; scenario: string; version: number; status: string }>;
  const publishedCount = presets.filter((preset) => preset.status === 'published').length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="Prompt 预设"
        title="教师端的 AI，要先被学校定义好。"
        description="预设不是随手填 prompt。它定义课堂场景、变量和版本，教师只能使用 published 版本。"
        metrics={[
          { label: '全部预设', value: presets.length, hint: 'draft / published / disabled' },
          { label: '已发布', value: publishedCount, hint: '教师可用' },
          { label: '生命周期', value: '3 态', hint: 'draft → published → disabled' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="预设列表"
          description="发布真实预设前，教师问答保持阻塞。"
          action={<AdminPromptPresetDialog />}
        />
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>场景</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState title="暂无 Prompt 预设" description="发布真实预设前，教师问答保持阻塞。" />
                  </TableCell>
                </TableRow>
              ) : (
                presets.map((preset) => (
                  <TableRow key={preset.id}>
                    <TableCell>{preset.title}</TableCell>
                    <TableCell>{preset.scenario}</TableCell>
                    <TableCell>v{preset.version}</TableCell>
                    <TableCell>{preset.status}</TableCell>
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
