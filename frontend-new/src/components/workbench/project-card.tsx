import { BookOpen, MessageSquare, Target } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BloomBadge, type BloomLevel } from '@/components/workbench/bloom-badge';

export interface ProjectCardData {
  id: string;
  title: string;
  author?: string;
  highestLevel?: BloomLevel;
  questionCount: number;
  practiceCount: number;
  updatedLabel?: string;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const progress = project.highestLevel ? (project.highestLevel / 6) * 100 : 0;
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
        <Progress value={progress} aria-label="布鲁姆认知路径进度" />
        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><MessageSquare className="size-4" />问题 {project.questionCount}</span>
          <span className="flex items-center gap-2"><Target className="size-4" />练习 {project.practiceCount}</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button render={<a href={`/student/projects/${project.id}`}><BookOpen className="mr-2 size-4" />继续学习</a>} className="w-full" variant="outline" />
      </CardFooter>
    </Card>
  );
}
