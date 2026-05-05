import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChallengeClient } from '@/components/workbench/challenge-client';
import { BloomBadge, type BloomLevel } from '@/components/workbench/bloom-badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getStudentProject, getStudentWorkspace } from '@/lib/data/student';

function nextLevel(level?: number | null): BloomLevel {
  if (!level) return 1;
  return Math.min(level + 1, 6) as BloomLevel;
}

export default async function StudentChallengePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [workspace, result] = await Promise.all([getStudentWorkspace(), getStudentProject(projectId)]);

  if (!workspace.ok) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <ErrorState title="挑战能力状态加载失败" description={workspace.message} />
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <ErrorState title="篇目挑战加载失败" description={result.message} />
      </div>
    );
  }

  if (!result.data) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <EmptyState
          title="未找到真实篇目项目"
          description={`项目 ${projectId} 尚未从 Supabase 返回可访问记录。请先在学习提问中创建真实项目。`}
          action={<Button nativeButton={false} render={<Link href="/student/challenge">返回挑战入口</Link>} />}
        />
      </div>
    );
  }

  const { project, practices } = result.data;
  const latestPractice = practices[0];
  const achievedCount = practices.filter((practice) => practice.achieved).length;
  const currentTarget = latestPractice && latestPractice.evaluation_state !== 'evaluated' ? latestPractice.target_bloom_level : nextLevel(project.highest_bloom_level);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="单篇挑战"
        title={`《${project.title}》认知挑战`}
        description="挑战生成、作答评估、练习记录保存与项目认知状态更新在此闭环完成。缺少真实 Provider 时会明确阻塞。"
        primaryAction={{ label: '返回挑战入口', href: '/student/challenge' }}
        secondaryAction={{ label: '查看项目详情', href: `/student/projects/${project.id}` }}
        metrics={[
          { label: '最高层级', value: project.highest_bloom_level ? `L${project.highest_bloom_level}` : '未达成', hint: 'text_projects.highest_bloom_level' },
          { label: '挑战记录', value: practices.length, hint: 'practice_records' },
          { label: '达成次数', value: achievedCount, hint: '真实评估结果' },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">当前目标</CardTitle></CardHeader>
          <CardContent><BloomBadge level={currentTarget} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">最近挑战状态</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{latestPractice ? `${latestPractice.evaluation_state}${latestPractice.achieved === null ? '' : latestPractice.achieved ? ' · 已达成' : ' · 未达成'}` : '暂无挑战'}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">数据写入</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">评估后写入 practice_records；达成时更新项目最高认知层级。</CardContent>
        </Card>
      </div>

      <ChallengeClient
        projectId={project.id}
        projectTitle={project.title}
        projectAuthor={project.author}
        highestBloomLevel={project.highest_bloom_level}
        initialPractice={latestPractice?.evaluation_state === 'evaluated' ? undefined : latestPractice}
        challengeBlocked={workspace.data.challengeBlocked}
      />
    </div>
  );
}
