import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingSurface, PermissionState } from '@/components/workbench/state-surfaces';

export default function TeacherAnalyticsPage() {
  const loading = false;
  const error: string | null = null;
  const permissionDenied = false;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div><h1 className="font-heading text-3xl">学情线索</h1><p className="mt-1 text-sm text-muted-foreground">只展示教师班级范围内的真实行动线索。</p></div>
      {loading ? <LoadingSurface label="正在加载学情线索" /> : null}
      {permissionDenied ? <PermissionState title="无权查看学情线索" description="当前账号没有可访问班级范围。" /> : null}
      {error ? <ErrorState title="学情线索加载失败" description={error} /> : null}
      <div className="grid gap-4 md:grid-cols-3">{['assigned classes', 'audit workload', 'students needing review'].map((label) => <Card key={label}><CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">0</p><p className="text-sm text-muted-foreground">暂无真实数据</p></CardContent></Card>)}</div>
      <EmptyState title="暂无可行动学情摘要" description="当班级、学生互动与审计记录可用后，这里会显示需要复盘的学生、布鲁姆分布和审计待办。" action={<Button render={<a href="/teacher/audit">查看审计队列</a>} variant="outline" />} />
    </div>
  );
}
