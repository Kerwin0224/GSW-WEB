import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BloomLadder } from '@/components/workbench/bloom-ladder';
import { BlockedState, EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';

export default async function StudentProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = null as null | { title: string };
  const loading = false;
  const error: string | null = null;
  const permissionDenied = false;
  const practiceBlocked = false;
  const practiceCommitted = false;

  if (loading) return <div className="mx-auto max-w-5xl p-6"><LoadingSurface label="正在加载篇目详情" /></div>;
  if (permissionDenied) return <div className="mx-auto max-w-5xl p-6"><PermissionState title="无权访问该篇目" description="只能查看自己拥有访问范围的真实篇目项目。" /></div>;
  if (error) return <div className="mx-auto max-w-5xl p-6"><ErrorState title="篇目详情加载失败" description={error} /></div>;

  if (!project) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <EmptyState title="未找到真实篇目项目" description={`项目 ${projectId} 尚未从 Supabase 返回可访问记录。请先在学习提问中创建真实项目。`} action={<Button render={<Link href="/student/projects">返回篇目项目</Link>} />} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div><h1 className="font-heading text-3xl">篇目详情</h1><p className="text-sm text-muted-foreground">当前最高层级会在真实分类完成后显示。</p></div>
      {practiceBlocked ? <BlockedState title="下一步练习暂不可用" description="缺少 practice_generation 能力配置；不会根据空项目生成模拟练习。" /> : null}
      {practiceCommitted ? <SuccessState title="练习记录已保存" description="真实评估结果提交后会更新篇目认知路径。" /> : null}
      <Tabs defaultValue="ladder">
        <TabsList><TabsTrigger value="ladder">认知路径</TabsTrigger><TabsTrigger value="questions">问题记录</TabsTrigger><TabsTrigger value="practice">练习记录</TabsTrigger></TabsList>
        <TabsContent value="ladder"><BloomLadder levels={{}} /></TabsContent>
        <TabsContent value="questions"><Card><CardHeader><CardTitle>问题记录</CardTitle></CardHeader><CardContent>暂无真实问题记录。</CardContent></Card></TabsContent>
        <TabsContent value="practice"><Card><CardHeader><CardTitle>练习记录</CardTitle></CardHeader><CardContent>暂无真实练习记录。</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
