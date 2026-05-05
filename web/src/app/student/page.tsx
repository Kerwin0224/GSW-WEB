import { Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { StudentChatClient } from '@/components/workbench/student-chat-client';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { getStudentProjects, getStudentWorkspace } from '@/lib/data/student';

export default async function StudentChatPage() {
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
  const blockedReasons = [workspace.data.providerBlocked, workspace.data.classificationBlocked].filter(Boolean);

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      {blockedReasons.length > 0 ? (
        <Alert className="shrink-0 border-destructive/30 bg-destructive/5">
          <Sparkles className="size-4" aria-hidden="true" />
          <AlertTitle className="font-heading">AI 学习链路还没有完全就绪</AlertTitle>
          <AlertDescription>{blockedReasons.join('；')}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="flex min-h-0 flex-1 overflow-hidden border-primary/20 shadow-sm">
        <CardContent className="flex min-h-0 flex-1 p-0">
          <StudentChatClient
            providerBlocked={workspace.data.providerBlocked}
            classificationBlocked={workspace.data.classificationBlocked}
            projects={projects}
          />
        </CardContent>
      </Card>
    </div>
  );
}
