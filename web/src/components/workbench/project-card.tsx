import { BookOpen, MessageSquare, Route, Swords, Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { BloomBadge, bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';
import type { ProjectSummary } from '@/lib/data/student';
import { cn } from '@/lib/utils';

export type ProjectCardData = ProjectSummary;

function BloomMiniBar({ project }: { project: ProjectCardData }) {
  return (
    <div className="grid grid-cols-6 gap-1.5" aria-label={`《${project.title}》会话问题触达层级缩略图`}>
      {([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => {
        const info = bloomLevelInfo[level];
        const summary = project.levelSummary.find((item) => item.level === level);
        const active = Boolean(project.highestLevel && level <= project.highestLevel);
        return (
          <div
            key={level}
            className={cn(
              'rounded-md border px-1.5 py-2 text-center text-[10px] transition-[border-color,background-color,box-shadow] duration-200',
              active ? 'border-primary/35 bg-primary/12 text-primary shadow-sm group-hover/card:shadow-soft' : 'border-border/70 bg-muted/35 text-muted-foreground'
            )}
            title={`L${level} ${info.label}：${summary?.questionCount ?? 0} 个问题，${summary?.achievedChallengeCount ?? 0} 次挑战达成`}
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

  return (
    <Card className="group relative overflow-hidden border-border/70 bg-card/90 shadow-soft backdrop-blur transition-[border-color,box-shadow,background-color] duration-200 hover:border-primary/35 hover:bg-card hover:shadow-ink">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-destructive/70" />
      <CardHeader className="relative pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate font-heading text-2xl leading-9 tracking-tight">《{project.title}》{project.author ? ` · ${project.author}` : ''}</CardTitle>
            <p className="text-xs text-muted-foreground">{project.updatedLabel ?? '最近学习时间待同步'}</p>
          </div>
          {confirmedLevel ? <BloomBadge level={confirmedLevel} /> : <span className="shrink-0 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-muted-foreground">等待挑战确认</span>}
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <BloomMiniBar project={project} />
        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 rounded-lg border border-border/55 bg-background/72 px-3 py-2.5"><MessageSquare className="size-4 text-primary" aria-hidden="true" />问题 {project.questionCount}</span>
          <span className="flex items-center gap-2 rounded-lg border border-border/55 bg-background/72 px-3 py-2.5"><Target className="size-4 text-primary" aria-hidden="true" />挑战 {project.practiceCount}</span>
          <span className="flex items-center gap-2 rounded-lg border border-border/55 bg-background/72 px-3 py-2.5"><Route className="size-4 text-primary" aria-hidden="true" />会话 {project.sessions.length}</span>
          <span className="flex items-center gap-2 rounded-lg border border-border/55 bg-background/72 px-3 py-2.5"><Swords className="size-4 text-primary" aria-hidden="true" />已确认 {confirmedLevel ? `L${confirmedLevel}` : '等待'}</span>
        </div>
        <p className="rounded-lg border border-accent/25 bg-accent/12 px-4 py-3 text-xs leading-6 text-muted-foreground shadow-sm">
          会话问题触达层级仅作认知路径参考；项目当前状态以挑战确认结果为准。{project.challengeProgress.statusLabel}；下一步 {project.challengeProgress.isComplete ? '完成全部挑战' : `继续 L${project.challengeProgress.nextLevel} 挑战`}。
        </p>
      </CardContent>
      <CardFooter className="relative grid gap-2 pt-0 sm:grid-cols-2">
        <Button nativeButton={false} render={<a href={`/student?projectId=${project.id}`}><BookOpen className="mr-2 size-4" />回到项目提问</a>} className="min-h-11 w-full cursor-pointer rounded-lg" variant="outline" />
        <Button nativeButton={false} render={<a href={`/student/challenge/${project.id}`}><Swords className="mr-2 size-4" />继续挑战</a>} className="min-h-11 w-full cursor-pointer rounded-lg shadow-sm" />
      </CardFooter>
    </Card>
  );
}
