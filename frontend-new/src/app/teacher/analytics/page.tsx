import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { getTeacherAnalytics } from '@/lib/data/teacher';

export default async function TeacherAnalyticsPage() {
  const result = await getTeacherAnalytics();
  if (!result.ok) return <div className="p-6"><ErrorState title="学情线索加载失败" description={result.message} /></div>;
  const cards = [{ label: 'assigned classes', value: result.data.assignedClasses }, { label: 'audit workload', value: result.data.auditWorkload }, { label: 'students needing review', value: result.data.studentsNeedingReview }];
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div><h1 className="font-heading text-3xl">学情线索</h1><p className="mt-1 text-sm text-muted-foreground">只展示教师班级范围内的真实行动线索。</p></div><div className="grid gap-4 md:grid-cols-3">{cards.map((card) => <Card key={card.label}><CardHeader><CardTitle className="text-base">{card.label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{card.value}</p><p className="text-sm text-muted-foreground">真实数据</p></CardContent></Card>)}</div><EmptyState title="暂无可行动学情摘要" description="当班级、学生互动与审计记录可用后，这里会显示需要复盘的学生、布鲁姆分布和审计待办。" action={<Button render={<a href="/teacher/audit">查看审计队列</a>} variant="outline" />} /></div>;
}
