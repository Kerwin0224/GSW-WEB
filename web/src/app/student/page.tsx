import { Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { StudentChatClient } from '@/components/workbench/student-chat-client';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { getStudentProjects, getStudentWorkspace } from '@/lib/data/student';

export default async function StudentChatPage({ searchParams }: { searchParams?: Promise<{ projectId?: string }> }) {
  const params = await searchParams;
  const [workspace, projectsResult] = await Promise.all([
    getStudentWorkspace(),
    getStudentProjects(),
  ]);

  if (!workspace.ok) {
    return (
      <div className="p-6">
        <ErrorState title="学习提问加载失败" description={workspace.message} />
      </div>
    );
  }

  const projects = projectsResult.ok ? projectsResult.data : [];
  const initialActiveProjectId = params?.projectId && projects.some((project) => project.id === params.projectId)
    ? params.projectId
    : undefined;
  const blockedReasons = [workspace.data.providerBlocked, workspace.data.classificationBlocked].filter(Boolean);

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      {blockedReasons.length > 0 ? (
        <Alert className="shrink-0 border-destructive/30 bg-destructive/8 shadow-soft backdrop-blur">
          <Sparkles className="size-4" aria-hidden="true" />
          <AlertTitle className="font-heading">AI 学习链路还没有完全就绪</AlertTitle>
          <AlertDescription>{blockedReasons.join('；')}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="relative flex min-h-0 flex-1 overflow-hidden border-primary/20 bg-card/92 shadow-ink backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-destructive/70" />
        <CardContent className="flex min-h-0 flex-1 p-0 pt-1">
          <StudentChatClient
            key={initialActiveProjectId ?? 'archive'}
            providerBlocked={workspace.data.providerBlocked}
            classificationBlocked={workspace.data.classificationBlocked}
            projects={projects}
            dailyArchive={workspace.data.dailyArchive}
            initialActiveProjectId={initialActiveProjectId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
