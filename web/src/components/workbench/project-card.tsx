import { BookOpen, MessageSquare, Route, Swords } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { BloomBadge, bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';
import type { ProjectSummary } from '@/lib/data/student';
import { cn } from '@/lib/utils';

export type ProjectCardData = ProjectSummary;

function BloomMiniBar({ project }: { project: ProjectCardData }) {
  const confirmedLevel = project.challengeProgress.confirmedLevel;
  return (
    <div className="grid grid-cols-6 gap-1.5" aria-label={`《${project.title}》挑战确认层级缩略图，学生问题路径只作挑战参考`}>
      {([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => {
        const info = bloomLevelInfo[level];
        const summary = project.levelSummary.find((item) => item.level === level);
        const active = Boolean(confirmedLevel && level <= confirmedLevel);
        return (
          <div
            key={level}
            className={cn(
              'rounded-md border px-1.5 py-2 text-center text-[10px] transition-[border-color,background-color] duration-200',
              active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/60 bg-muted/30 text-muted-foreground'
            )}
            title={`L${level} ${info.label}：学生问题路径参考 ${summary?.pathQuestionCount ?? 0} 个，挑战通过确认 ${summary?.confirmedChallengeCount ?? 0} 次`}
          >
            <span className="block font-semibold">L{level}</span>
            <span className="sr-only">{info.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const confirmedLevel = project.challengeProgress.confirmedLevel;
  const nextLabel = project.challengeProgress.isComplete ? '已完成全部六层挑战' : `继续 L${project.challengeProgress.nextLevel} 挑战`;

  return (
    <Card className="group/card relative flex h-full flex-col overflow-hidden border-border/60 bg-card/95 shadow-soft transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-ink">
      {/* 顶部双色条：黛蓝→紫金，古典而克制；朱砂留给警示。 */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary via-primary/70 to-accent" aria-hidden="true" />
      <CardHeader className="pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="truncate font-heading text-2xl leading-8 tracking-tight">《{project.title}》</CardTitle>
            <p className="truncate text-xs text-muted-foreground">
              {project.author ? <span>{project.author} · </span> : null}
              {project.updatedLabel ?? '最近学习时间待同步'}
            </p>
          </div>
          {confirmedLevel ? (
            <BloomBadge level={confirmedLevel} />
          ) : (
            <span className="shrink-0 rounded-md border border-accent/40 bg-accent/8 px-2.5 py-1 text-xs text-accent-foreground/80">等待挑战</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pb-4">
        <BloomMiniBar project={project} />

        {/* 三项关键度量：问题、当前、下一挑战；分割线替代 4 个边框框。 */}
        <dl className="grid grid-cols-3 divide-x divide-border/60 rounded-lg border border-border/55 bg-background/70">
          <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
            <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <MessageSquare className="size-3" aria-hidden="true" />问题
            </dt>
            <dd className="font-heading text-xl tabular-nums">{project.questionCount}</dd>
          </div>
          <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
            <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Swords className="size-3" aria-hidden="true" />当前
            </dt>
            <dd className="font-heading text-xl tabular-nums">{confirmedLevel ? `L${confirmedLevel}` : '—'}</dd>
          </div>
          <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
            <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Route className="size-3" aria-hidden="true" />下一
            </dt>
            <dd className="font-heading text-xl tabular-nums">{project.challengeProgress.isComplete ? '✓' : `L${project.challengeProgress.nextLevel}`}</dd>
          </div>
        </dl>

        {/* 单行状态摘要，替代之前 6 行冗长描述。 */}
        <p className="mt-auto text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{project.challengeProgress.statusLabel}</span>
          <span className="mx-1.5 text-border">·</span>
          {nextLabel}
        </p>
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          nativeButton={false}
          render={<a href={`/student?projectId=${project.id}`}><BookOpen className="mr-2 size-4" aria-hidden="true" />进入项目新会话</a>}
          className="min-h-11 w-full cursor-pointer rounded-lg"
        />
      </CardFooter>
    </Card>
  );
}
