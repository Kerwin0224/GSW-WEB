import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BloomLadder } from '@/components/workbench/bloom-ladder';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { getStudentProject } from '@/lib/data/student';
import type { BloomLevel } from '@/components/workbench/bloom-badge';

export default async function StudentProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await getStudentProject(projectId);
  if (!result.ok) return <div className="mx-auto max-w-5xl p-6"><ErrorState title="篇目详情加载失败" description={result.message} /></div>;
  if (!result.data) return <div className="mx-auto max-w-5xl p-6"><EmptyState title="未找到真实篇目项目" description={`项目 ${projectId} 尚未从 Supabase 返回可访问记录。请先在学习提问中创建真实项目。`} action={<Button render={<Link href="/student/projects">返回篇目项目</Link>} />} /></div>;
  const { project, questions, practices } = result.data;
  const levels = questions.reduce((acc, q) => { if (q.bloom_level && q.bloom_level >= 1 && q.bloom_level <= 6) { const level = q.bloom_level as BloomLevel; acc[level] = acc[level] ?? { questions: [] }; acc[level]!.questions.push({ id: q.id, text: q.content }); } return acc; }, {} as Partial<Record<BloomLevel, { questions: { id: string; text: string }[] }>>);
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div><h1 className="font-heading text-3xl">《{project.title}》{project.author ? ` · ${project.author}` : ''}</h1><p className="text-sm text-muted-foreground">当前最高层级：{project.highest_bloom_level ? `L${project.highest_bloom_level}` : '尚无真实分类数据'}</p></div><Tabs defaultValue="ladder"><TabsList><TabsTrigger value="ladder">认知路径</TabsTrigger><TabsTrigger value="questions">问题记录</TabsTrigger><TabsTrigger value="practice">练习记录</TabsTrigger></TabsList><TabsContent value="ladder"><BloomLadder levels={levels} currentMaxLevel={project.highest_bloom_level as BloomLevel | undefined} /></TabsContent><TabsContent value="questions"><Card><CardHeader><CardTitle>问题记录</CardTitle></CardHeader><CardContent className="space-y-3">{questions.length === 0 ? '暂无真实问题记录。' : questions.map((q) => <p key={q.id} className="rounded-lg border p-3 text-sm">{q.content}</p>)}</CardContent></Card></TabsContent><TabsContent value="practice"><Card><CardHeader><CardTitle>练习记录</CardTitle></CardHeader><CardContent className="space-y-3">{practices.length === 0 ? '暂无真实练习记录。' : practices.map((p) => <p key={p.id} className="rounded-lg border p-3 text-sm">L{p.target_bloom_level} · {p.evaluation_state}</p>)}</CardContent></Card></TabsContent></Tabs></div>;
}
