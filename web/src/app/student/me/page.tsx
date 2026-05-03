import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
import { BloomBadge } from '@/components/workbench/bloom-badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { getStudentProfileSummary } from '@/lib/data/student';

export default async function StudentProfilePage() {
  const result = await getStudentProfileSummary();
  if (!result.ok) return <div className="p-6"><ErrorState title="学习画像加载失败" description={result.message} /></div>;
  const { distribution } = result.data;
  const hasRecords = distribution.some((item) => item.count > 0);
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="学习画像"
        title="看见自己是怎么读懂古诗文的。"
        description="画像只基于真实问题与练习记录生成，不做排名，不做惩罚性评分，只回答下一步应该怎么学。"
        primaryAction={{ label: '继续提问', href: '/student' }}
        secondaryAction={{ label: '查看篇目', href: '/student/projects' }}
        metrics={[
          { label: '认知记录', value: distribution.reduce((sum, item) => sum + item.count, 0), hint: '真实项目分布' },
          { label: '覆盖层级', value: distribution.filter((item) => item.count > 0).length, hint: '布鲁姆六层覆盖' },
          { label: '下一步', value: hasRecords ? '复盘' : '提问', hint: hasRecords ? '找薄弱层级' : '创建第一条记录' },
        ]}
      />
      <Card>
        <CardHeader><CardTitle>布鲁姆认知分布</CardTitle></CardHeader>
        <CardContent>
          {hasRecords ? null : (
            <EmptyState
              title="暂无认知画像"
              description="完成真实提问和练习评估后，这里会显示跨项目的层级分布与下一步建议。"
              action={<Button render={<a href="/student">去提问</a>} />}
            />
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
            {distribution.map((item) => (
              <div key={item.level} className="rounded-xl border bg-background/60 p-3 text-center">
                <BloomBadge level={item.level} />
                <p className="mt-2 text-2xl font-semibold">{item.count}</p>
                <p className="text-xs text-muted-foreground">真实记录</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
