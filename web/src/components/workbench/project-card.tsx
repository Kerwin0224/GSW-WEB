import { BookOpen, MessageSquare, Route, Swords, Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { BloomBadge, bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';
import type { ProjectSummary } from '@/lib/data/student';
import { cn } from '@/lib/utils';

export type ProjectCardData = ProjectSummary;

function BloomMiniBar({ project }: { project: ProjectCardData }) {
  return (
    <div className="grid grid-cols-6 gap-1" aria-label={`《${project.title}》布鲁姆六层缩略进度`}>
      {([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => {
        const info = bloomLevelInfo[level];
        const summary = project.levelSummary.find((item) => item.level === level);
        const active = Boolean(project.highestLevel && level <= project.highestLevel);
        return (
          <div
            key={level}
            className={cn('rounded-md border px-1.5 py-2 text-center text-[10px]', active ? 'border-primary/30 bg-primary/10' : 'bg-muted/40 text-muted-foreground')}
            title={`L${level} ${info.label}：${summary?.questionCount ?? 0} 个问题，${summary?.achievedChallengeCount ?? 0} 次挑战达成`}
          >
            <span className="block font-medium">L{level}</span>
            <span className="sr-only">{info.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  return (
    <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-xl">《{project.title}》{project.author ? ` · ${project.author}` : ''}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{project.updatedLabel ?? '最近学习时间待同步'}</p>
          </div>
          {project.highestLevel ? <BloomBadge level={project.highestLevel} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <BloomMiniBar project={project} />
        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><MessageSquare className="size-4" />问题 {project.questionCount}</span>
          <span className="flex items-center gap-2"><Target className="size-4" />练习 {project.practiceCount}</span>
          <span className="flex items-center gap-2"><Route className="size-4" />会话 {project.sessions.length}</span>
          <span className="flex items-center gap-2"><Swords className="size-4" />挑战 {project.challengeProgress.achievedCount}/{project.challengeProgress.attemptedCount}</span>
        </div>
        {project.challengeProgress.latestTargetLevel ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            下一次可继续挑战 L{project.challengeProgress.latestTargetLevel}，当前状态：{project.challengeProgress.latestState ?? '待开始'}。
          </p>
        ) : (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">尚无挑战记录，进入层级挑战确认你的真实认知水平。</p>
        )}
      </CardContent>
      <CardFooter className="grid gap-2 sm:grid-cols-2">
        <Button render={<a href={`/student/projects/${project.id}`}><BookOpen className="mr-2 size-4" />继续学习</a>} className="w-full" variant="outline" />
        <Button render={<a href={`/student/challenge/${project.id}`}><Swords className="mr-2 size-4" />进入挑战</a>} className="w-full" />
      </CardFooter>
    </Card>
  );
}
