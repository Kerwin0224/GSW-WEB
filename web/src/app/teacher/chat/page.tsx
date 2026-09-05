import { Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { TeacherChatClient } from '@/components/workbench/teacher-chat-client';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { getTeacherConversation, getTeacherWorkspace } from '@/lib/data/teacher';

export default async function TeacherChatPage({ searchParams }: { searchParams?: Promise<{ conversationId?: string }> }) {
  const params = await searchParams;
  const [workspace, conversationResult] = await Promise.all([
    getTeacherWorkspace(),
    params?.conversationId ? getTeacherConversation(params.conversationId) : Promise.resolve(null),
  ]);

  if (!workspace.ok) {
    return (
      <div className="p-6">
        <ErrorState title="教师问答加载失败" description={workspace.message} />
      </div>
    );
  }

  if (conversationResult && !conversationResult.ok) {
    return (
      <div className="p-6">
        <ErrorState title="会话加载失败" description={conversationResult.message} />
      </div>
    );
  }

  const initialConversation = conversationResult?.ok ? conversationResult.data ?? undefined : undefined;

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      {workspace.data.providerBlocked ? (
        <Alert className="shrink-0 border-destructive/30 bg-destructive/8 shadow-soft backdrop-blur">
          <Sparkles className="size-4" aria-hidden="true" />
          <AlertTitle className="font-heading">教师问答能力未就绪</AlertTitle>
          <AlertDescription>{workspace.data.providerBlocked}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="relative flex min-h-0 flex-1 overflow-hidden border-primary/20 bg-card/92 shadow-ink backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-destructive/70" />
        <CardContent className="flex min-h-0 flex-1 p-0 pt-1">
          <TeacherChatClient
            key={initialConversation?.id ?? 'teacher-chat'}
            presets={workspace.data.presets}
            sessions={workspace.data.sessions}
            initialConversation={initialConversation}
            providerBlocked={workspace.data.providerBlocked}
          />
        </CardContent>
      </Card>
    </div>
  );
}
