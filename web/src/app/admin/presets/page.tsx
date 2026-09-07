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
  const presetStatusLabel: Record<string, string> = { draft: '草稿', published: '已发布', disabled: '已停用' };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="Prompt 预设"
        description="预设包含教学场景、变量、版本和发布状态；教师端只显示已发布版本。"
        metrics={[
          { label: '全部预设', value: presets.length, hint: '包含草稿、已发布与已停用' },
          { label: '已发布', value: publishedCount, hint: '教师可用' },
          { label: '状态', value: '3 种', hint: '草稿 / 已发布 / 已停用' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="预设列表"
          description="没有已发布预设时，教师仍可直接使用备课问答，但没有可选教学模板。"
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
                    <EmptyState title="暂无 Prompt 预设" description="创建并发布后，教师可在备课问答中选用；没有预设时仍可直接提问。" />
                  </TableCell>
                </TableRow>
              ) : (
                presets.map((preset) => (
                  <TableRow key={preset.id}>
                    <TableCell>{preset.title}</TableCell>
                    <TableCell>{preset.scenario}</TableCell>
                    <TableCell>v{preset.version}</TableCell>
                    <TableCell>{presetStatusLabel[preset.status] ?? preset.status}</TableCell>
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
