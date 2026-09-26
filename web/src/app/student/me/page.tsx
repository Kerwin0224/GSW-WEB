import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceHero, SectionHeader } from '@/components/workbench/workspace-hero';
import { BloomBadge } from '@/components/workbench/bloom-badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { Pagination } from '@/components/workbench/pagination';
import { firstParam, parsePageParam } from '@/lib/pagination';
import { ProjectCard } from '@/components/workbench/project-card';
import { StudentProjectCreateButton } from '@/components/workbench/student-project-create-button';
import { getStudentProfileSummary } from '@/lib/data/student';
import { CognitiveProfileMatrix } from './cognitive-profile-matrix';

// 每页项目数。卡片是三列网格，12 = 4 行整，避免末行残缺。
const PROJECTS_PAGE_SIZE = 12;

export default async function StudentProfilePage({ searchParams }: { searchParams?: Promise<{ page?: string | string[]; spaceId?: string | string[] }> }) {
  const params = await searchParams;
  const page = parsePageParam(params?.page);
  const spaceId = firstParam(params?.spaceId);
  const result = await getStudentProfileSummary({ spaceId, page, pageSize: PROJECTS_PAGE_SIZE });
  if (!result.ok) return <div className="p-6"><ErrorState title="学习看板加载失败" description={result.message} /></div>;
  const {
    distribution,
    projectBloomMatrix,
    projects,
    totalProjects,
    questionCount,
    challengeCount,
    awaitingChallengeCount,
    activity,
  } = result.data;
  const hasRecords = projectBloomMatrix.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="学习记录"
        description="按项目查看提问记录、挑战练习和已经通过的层级。"
        primaryAction={{ label: '学习提问', href: spaceId ? `/student?spaceId=${spaceId}` : '/student' }}
        secondaryAction={{ label: '挑战练习', href: spaceId ? `/student/challenge?spaceId=${spaceId}` : '/student/challenge' }}
        metrics={[
          { label: '项目', value: totalProjects, hint: '有学习记录的项目' },
          { label: '提问记录', value: questionCount, hint: '累计提问次数' },
          { label: '挑战记录', value: challengeCount, hint: '累计生成的挑战题' },
          { label: '尚未通过', value: awaitingChallengeCount, hint: '挑战过、但还没有通过的项目' },
          { label: '附件与作业', value: activity.attachment + activity.submission, hint: `上传附件 ${activity.attachment} 份 · 提交作业 ${activity.submission} 次` },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="我的项目"
          description="选择项目，开始新的学习提问；也可以围绕自己的专题自建项目。"
          action={<StudentProjectCreateButton spaceId={spaceId} />}
        />
        {totalProjects === 0 ? (
          <EmptyState
            title="还没有项目记录"
            description="提出第一个学习问题后，学习记录会按识别到的归属保存。"
            action={<Button nativeButton={false} render={<Link href={spaceId ? `/student?spaceId=${spaceId}` : '/student'}>开始提问</Link>} />}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} spaceId={spaceId} />
              ))}
            </div>
            <Pagination
              page={page}
              pageSize={PROJECTS_PAGE_SIZE}
              total={totalProjects}
              itemLabel="个项目"
              buildHref={(target) => {
                const query = new URLSearchParams();
                if (spaceId) query.set('spaceId', spaceId);
                if (target > 1) query.set('page', String(target));
                const suffix = query.toString();
                return suffix ? `/student/me?${suffix}` : '/student/me';
              }}
            />
          </>
        )}
      </section>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>学习活动</CardTitle>
            <CardDescription>提问之外的活动也在册：挑战、附件与作业都会计进来。</CardDescription>
          </div>
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/student/export">导出我的数据</Link>} />
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 divide-x divide-border/60 rounded-lg border border-border/55 bg-background/70 sm:grid-cols-4">
            {([
              ['提问', activity.question, '在学习提问里提出的问题条数'],
              ['挑战', activity.challenge, '生成过的挑战记录条数'],
              ['附件', activity.attachment, '上传到项目的材料份数'],
              ['作业', activity.submission, '提交的作业次数'],
            ] as const).map(([label, value, hint]) => (
              <div key={label} className="px-3 py-4 text-center">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-heading text-2xl tabular-nums">{value}</dd>
                <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">{hint}</p>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>项目挑战进度</CardTitle>
          <CardDescription>每一行对应一个项目，显示 L1 到 L6 的挑战通过情况。</CardDescription>
        </CardHeader>
        <CardContent>
          {hasRecords ? null : (
            <EmptyState
              title="等待第一次挑战"
              description="完成第一次挑战后，这里会出现各层级的通过情况。"
              action={<Button nativeButton={false} render={<Link href={spaceId ? `/student/challenge?spaceId=${spaceId}` : '/student/challenge'}>去挑战</Link>} />}
            />
          )}
          {hasRecords ? <CognitiveProfileMatrix rows={projectBloomMatrix} /> : null}
          {hasRecords ? (
            <Pagination
              className="pt-4"
              page={page}
              pageSize={PROJECTS_PAGE_SIZE}
              total={totalProjects}
              itemLabel="个项目"
              buildHref={(target) => {
                const query = new URLSearchParams();
                if (spaceId) query.set('spaceId', spaceId);
                if (target > 1) query.set('page', String(target));
                const suffix = query.toString();
                return suffix ? `/student/me?${suffix}` : '/student/me';
              }}
            />
          ) : null}
          <div className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">已通过层级分布</p>
              <p className="text-xs text-muted-foreground">按各项目最高通过层级统计</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {distribution.map((item) => (
                <div key={item.level} className="flex flex-col items-center gap-2 rounded-md px-2 py-3 transition-colors hover:bg-muted/40">
                  <BloomBadge level={item.level} />
                  <p className="font-heading text-2xl tabular-nums">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
