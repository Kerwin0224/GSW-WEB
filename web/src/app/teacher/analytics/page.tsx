import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getTeacherAnalytics } from '@/lib/data/teacher';

export default async function TeacherAnalyticsPage() {
  const result = await getTeacherAnalytics();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="学情线索加载失败" description={result.message} />
      </div>
    );
  }

  const cards = [
    { label: '负责班级', value: result.data.assignedClasses, hint: '由班级关系决定' },
    { label: '审计待办', value: result.data.auditWorkload, hint: '教师名下 pending 记录' },
    { label: '需复盘学生', value: result.data.studentsNeedingReview, hint: '后续由真实练习统计产生' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="学情线索"
        title="只展示能让老师下一步行动的数据。"
        description="这里不做热闹大屏。没有班级、互动和审计记录时，就明确为空；有数据后只呈现可复盘、可追问、可干预的线索。"
        primaryAction={{ label: '查看审计队列', href: '/teacher/audit' }}
        metrics={cards.map((card) => ({ label: card.label, value: card.value, hint: card.hint }))}
      />

      <section className="space-y-4">
        <SectionHeader title="行动指标" description="指标来自教师班级范围内的真实数据，不展示跨角色或模拟记录。" />
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardHeader><CardTitle className="text-base">{card.label}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-4xl font-semibold">{card.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{card.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <EmptyState
          title="暂无可行动学情摘要"
          description="当班级、学生互动与审计记录可用后，这里会显示需要复盘的学生、布鲁姆分布和审计待办。"
          action={<Button render={<a href="/teacher/audit">查看审计队列</a>} variant="outline" />}
        />
      </section>
    </div>
  );
}
