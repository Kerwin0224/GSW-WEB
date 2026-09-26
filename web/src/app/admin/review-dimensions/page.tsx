import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getReviewDimensionSettings, type AdminReviewDimension } from '@/lib/data/review-dimensions';
import { DimensionCreateDialog, DimensionRowActions } from './dimension-admin';
import { DIMENSION_IMPACT_HINT } from './dimension-copy';

const SEVERITY_LABEL: Record<string, string> = { low: '轻微', medium: '可疑', high: '严重' };

/**
 * AI 预审的评价维度配置。
 *
 * 维度决定「AI 该看什么」：平台默认六条全平台一份，学校行按稳定键覆盖，
 * 提示词从合并结果渲染。平台默认行在这里只读 —— 任何账号都改不了它，
 * 给可编辑按钮只会让人以为能改，然后撞上数据库的权限边界。
 */
export default async function AdminReviewDimensionsPage() {
  const result = await getReviewDimensionSettings();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="评价维度加载失败" description={result.message} />
      </div>
    );
  }

  const { platform, school, effective } = result.data;
  const overriddenKeys = new Set(school.map((dimension) => dimension.labelKey));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="AI 预审评价维度"
        description="维度决定 AI 预审看什么、疑点归到哪一格。平台默认全平台一份，本校可以按稳定键覆盖或停用。"
        metrics={[
          { label: '生效维度', value: effective.length, hint: '参与下一次 AI 预审的条数' },
          { label: '平台默认', value: platform.length, hint: '只读，任何账号不可改' },
          { label: '本校覆盖', value: school.length, hint: '同稳定键覆盖平台默认' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="评价维度"
          description={DIMENSION_IMPACT_HINT}
          action={<DimensionCreateDialog />}
        />
        {effective.length === 0 ? (
          <EmptyState
            title="还没有评价维度"
            description="AI 预审仍可发起，只是没有维度清单，模型按自由判断给疑点。新增一条即可开始按稳定键归类。"
          />
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>维度</TableHead>
                  <TableHead>稳定键</TableHead>
                  <TableHead>判定说明</TableHead>
                  <TableHead>默认严重度</TableHead>
                  <TableHead>顺序</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {effective.map((dimension, index) => (
                  <DimensionRow
                    key={dimension.id}
                    dimension={dimension}
                    overridden={overriddenKeys.has(dimension.labelKey)}
                    isFirst={index === 0}
                    isLast={index === effective.length - 1}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function DimensionRow({ dimension, overridden, isFirst, isLast }: { dimension: AdminReviewDimension; overridden: boolean; isFirst: boolean; isLast: boolean }) {
  const editable = dimension.origin === 'school';
  return (
    <TableRow>
      <TableCell className="font-medium">
        {dimension.displayName}
        {dimension.origin === 'platform' && overridden ? (
          <Badge variant="outline" className="ml-2">本校已覆盖</Badge>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-xs">{dimension.labelKey}</TableCell>
      <TableCell className="max-w-md text-sm text-muted-foreground">
        {dimension.promptFragment || dimension.criteria}
      </TableCell>
      <TableCell>{SEVERITY_LABEL[dimension.defaultSeverity] ?? dimension.defaultSeverity}</TableCell>
      <TableCell>{dimension.sortOrder}</TableCell>
      <TableCell>
        <Badge variant={dimension.enabled ? 'default' : 'secondary'}>{dimension.enabled ? '启用' : '已停用'}</Badge>
      </TableCell>
      <TableCell className="text-right">
        {editable ? (
          <DimensionRowActions dimension={dimension} isFirst={isFirst} isLast={isLast} />
        ) : (
          <span className="text-xs text-muted-foreground">平台默认，不可改</span>
        )}
      </TableCell>
    </TableRow>
  );
}
