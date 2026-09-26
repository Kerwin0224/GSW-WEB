import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { WorkspaceHero, SectionHeader } from '@/components/workbench/workspace-hero';
import { requireProfile } from '@/lib/auth';
import { listMyCapabilities, CAPABILITY_LABEL, type RoleGrantCapability } from '@/lib/data/role-grants';
import { listTeamAuditSummary } from '@/lib/data/team-view';

export const metadata = { title: '组内学情' };

/**
 * 教研组视角。
 *
 * 此前教师端只有「我任教班级的核实队列」这一条视线：年级组长要看全年级 AI 使用与
 * 核实完成率、教研组长要看同组老师的核实质量、备课组长要看谁长期不核实，
 * 都没有入口——角色只有 admin/teacher/student 三档，班主任与任课教师在数据层完全同质。
 * 能力位（role_grants）落地后，这里是它们的第一个落点。
 *
 * 没有被授予任何组内能力位时不报错，只说明为什么看不到：这是一个权限态，
 * 不是空数据态。
 */
export default async function TeacherTeamPage() {
  const profile = await requireProfile('teacher');
  if (!profile) return null;

  const capabilities = await listMyCapabilities();
  if (!capabilities.ok) return <ErrorState title="组内学情加载失败" description={capabilities.message} />;

  const granted = capabilities.data.filter((grant) => grant.capability === 'review_team');
  if (granted.length === 0) {
    return (
      <div className="space-y-6">
        <WorkspaceHero
          eyebrow="教师"
          title="组内学情"
          description="查看被授予的教研组范围内的核实完成情况"
        />
        <EmptyState
          title="没有组内查看权限"
          description="组内学情需要校管理员授予「组内核实」能力位。请联系校管理员为你的教研组或年级组开通后再来查看。"
        />
      </div>
    );
  }

  const summary = await listTeamAuditSummary(granted.map((grant) => grant.scopeId));
  if (!summary.ok) return <ErrorState title="组内学情加载失败" description={summary.message} />;

  return (
    <div className="space-y-6">
      <WorkspaceHero
        eyebrow="教师"
        title="组内学情"
        description={`你被授予了 ${granted.length} 个教学单元的组内查看权限`}
      />

      <SectionHeader title="按教学单元" description="每行是一个被授权的班级或空间" />

      <Card className="border-border/70 shadow-soft">
        <CardHeader>
          <CardTitle className="font-heading">核实完成情况</CardTitle>
          <CardDescription>
            统计口径：范围内尚未核实的会话数。已核实数是累计值，不随时间回退。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.data.map((row) => (
            <div
              key={row.scopeId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{row.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  教师 {row.teacherCount} 人 · 学生 {row.studentCount} 人
                </p>
              </div>
              <div className="flex items-center gap-2">
                {row.pendingCount > 0 ? (
                  <Badge variant="destructive">待核实 {row.pendingCount}</Badge>
                ) : (
                  <Badge variant="secondary">已清空</Badge>
                )}
                <Badge variant="outline">已核实 {row.finalizedCount}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
