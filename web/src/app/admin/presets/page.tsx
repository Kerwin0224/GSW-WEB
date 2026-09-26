import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminPresets } from '@/lib/data/admin';
import { createClient } from '@/lib/supabase/server';
import { PresetCreateDialog, PresetRowActions, type PresetItem, type PresetSpaceOption } from './preset-admin';
import { presetPurposeLabel } from '@/lib/presets';

const PRESET_STATUS_LABEL: Record<string, string> = { draft: '草稿', published: '已发布', disabled: '已停用' };

/** 空间是预设的作用域之一：空间、班级、学校三选一，页面只提供「全校 / 某个空间」两档。 */
async function listPresetSpaces(): Promise<PresetSpaceOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('spaces')
    .select('id,name,school_id')
    .eq('status', 'active')
    .order('name', { ascending: true });
  const rows = (data ?? []) as Array<{ id: string; name: string; school_id: string | null }>;
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export default async function AdminPresetsPage() {
  const [result, spaces] = await Promise.all([getAdminPresets(), listPresetSpaces()]);
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="Prompt 预设加载失败" description={result.message} />
      </div>
    );
  }

  const presets = result.data as PresetItem[];
  const spaceNameById = new Map(spaces.map((space) => [space.id, space.name]));
  const publishedCount = presets.filter((preset) => preset.status === 'published').length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="Prompt 预设"
        description="预设包含用途、作用域、教学场景、变量、版本和发布状态；教师端只显示已发布版本。"
        metrics={[
          { label: '全部预设', value: presets.length, hint: '包含草稿、已发布与已停用' },
          { label: '已发布', value: publishedCount, hint: '教师可用' },
          { label: '状态', value: '3 种', hint: '草稿 / 已发布 / 已停用' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="预设列表"
          description="用途决定这段文字被追加到哪一段提示词之前；不选空间就是全校通用。没有已发布预设时，教师仍可直接使用备课问答。"
          action={<PresetCreateDialog spaces={spaces} />}
        />
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>用途</TableHead>
                <TableHead>作用域</TableHead>
                <TableHead>场景</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState title="暂无 Prompt 预设" description="创建并发布后，教师可在备课问答中选用；没有预设时仍可直接提问。" />
                  </TableCell>
                </TableRow>
              ) : (
                presets.map((preset) => (
                  <TableRow key={preset.id}>
                    <TableCell className="font-medium">{preset.title}</TableCell>
                    <TableCell>{presetPurposeLabel(preset.purpose)}</TableCell>
                    <TableCell>{preset.space_id ? (spaceNameById.get(preset.space_id) ?? '空间已删除') : '全校通用'}</TableCell>
                    <TableCell>{preset.scenario}</TableCell>
                    <TableCell>v{preset.version}</TableCell>
                    <TableCell>
                      <Badge variant={preset.status === 'published' ? 'default' : 'secondary'}>
                        {PRESET_STATUS_LABEL[preset.status] ?? preset.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <PresetRowActions preset={preset} spaces={spaces} />
                    </TableCell>
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
