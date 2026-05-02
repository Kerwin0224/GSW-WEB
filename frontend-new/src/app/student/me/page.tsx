import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BloomBadge } from '@/components/workbench/bloom-badge';
import { EmptyState, ErrorState, LoadingSurface, PermissionState } from '@/components/workbench/state-surfaces';

export default function StudentProfilePage() {
  const distribution = [1, 2, 3, 4, 5, 6].map((level) => ({ level, count: 0 }));
  const hasRecords = distribution.some((item) => item.count > 0);
  const loading = false;
  const error: string | null = null;
  const permissionDenied = false;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div><h1 className="font-heading text-3xl">我的画像</h1><p className="mt-1 text-sm text-muted-foreground">只基于真实问题与练习记录生成，不做排名或惩罚性评分。</p></div>
      {loading ? <LoadingSurface label="正在加载学习画像" /> : null}
      {permissionDenied ? <PermissionState title="无法查看学习画像" description="当前账号缺少学生资料或画像访问范围。" /> : null}
      {error ? <ErrorState title="学习画像加载失败" description={error} /> : null}
      <Card>
        <CardHeader><CardTitle>布鲁姆认知分布</CardTitle></CardHeader>
        <CardContent>
          {hasRecords ? null : <EmptyState title="暂无认知画像" description="完成真实提问和练习评估后，这里会显示跨项目的层级分布与下一步建议。" action={<Button render={<a href="/student">去提问</a>} />} />}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">{distribution.map((item) => <div key={item.level} className="rounded-xl border p-3 text-center"><BloomBadge level={item.level} /><p className="mt-2 text-2xl font-semibold">{item.count}</p><p className="text-xs text-muted-foreground">真实记录</p></div>)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
