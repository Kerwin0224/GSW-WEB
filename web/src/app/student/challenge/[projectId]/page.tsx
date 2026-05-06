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

  const { project, practices, challengeProgress } = result.data;
  const latestPractice = practices[0];
  const achievedCount = practices.filter((practice) => practice.achieved).length;
  const currentTarget = latestPractice && latestPractice.evaluation_state !== 'evaluated' ? latestPractice.target_bloom_level : nextLevel(project.highest_bloom_level);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="项目挑战"
        title={`《${project.title}》挑战确认`}
        description="这里围绕单个篇目项目完成挑战生成、作答评估与层级确认。缺少真实 Provider 时会明确阻塞，不伪造题目或结果。"
        primaryAction={{ label: '返回挑战入口', href: '/student/challenge' }}
        secondaryAction={{ label: '在该项目里继续提问', href: `/student?projectId=${project.id}` }}
        metrics={[
          { label: '已确认层级', value: challengeProgress.confirmedLevel ? `L${challengeProgress.confirmedLevel}` : '等待挑战确认', hint: '只看挑战结果' },
          { label: '挑战记录', value: practices.length, hint: '当前项目下的真实挑战尝试' },
          { label: '已确认次数', value: achievedCount, hint: '真实评估结果' },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">下一挑战</CardTitle></CardHeader>
          <CardContent><BloomBadge level={currentTarget} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">当前项目状态</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{challengeProgress.statusLabel}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">结果写入</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">评估后保存挑战记录；达成时更新项目当前已确认层级。</CardContent>
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
