import { Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { StudentChatClient } from '@/components/workbench/student-chat-client';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { getStudentConversation, getStudentProjects, getStudentWorkspace } from '@/lib/data/student';
import { getStudentChatBlockedReasons, shouldClassifyProjectForStudentTurn } from '@/lib/student-chat-contract';

export default async function StudentChatPage({ searchParams }: { searchParams?: Promise<{ projectId?: string; conversationId?: string }> }) {
  const params = await searchParams;
  const [workspace, projectsResult, conversationResult] = await Promise.all([
    getStudentWorkspace(),
    getStudentProjects(),
    params?.conversationId ? getStudentConversation(params.conversationId) : Promise.resolve(null),
  ]);

  if (!workspace.ok) {
    return (
      <div className="p-6">
        <ErrorState title="学习提问加载失败" description={workspace.message} />
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
  const projects = projectsResult.ok ? projectsResult.data : [];
  const initialActiveProjectId = initialConversation ? initialConversation.projectId : params?.projectId;
  // Key 只承载“需要整机重建”的维度：切换会话或 finalize 状态翻转。
  // 消息内容变化走 StudentChatClient 内部 initialConversationSignature watch 平滑 setMessages，
  // 避免把 parts 序列化进 key 导致教师修订一到达就 unmount 客户端、丢失学生输入与排队状态。
  const chatClientKey = initialConversation
    ? `${initialConversation.id}|${initialConversation.conversationFinalized ? 'finalized' : 'open'}`
    : initialActiveProjectId ?? 'archive';
  const projectClassificationRequired = shouldClassifyProjectForStudentTurn({
    hasConversation: Boolean(initialConversation),
    hasProject: Boolean(initialActiveProjectId),
  });
  const blockedReasons = getStudentChatBlockedReasons({
    providerBlocked: workspace.data.providerBlocked,
    projectClassificationBlocked: workspace.data.projectClassificationBlocked,
    bloomClassificationBlocked: workspace.data.bloomClassificationBlocked,
    projectClassificationRequired,
  });

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-[100rem] flex-col px-3 py-3 sm:px-5 lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden">
      {blockedReasons.length > 0 ? (
        <Alert className="shrink-0 border-destructive/30 bg-destructive/8 shadow-soft backdrop-blur">
          <Sparkles className="size-4" aria-hidden="true" />
          <AlertTitle className="font-heading">AI 服务还没有准备好</AlertTitle>
          <AlertDescription>{blockedReasons.join('；')}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="relative flex min-h-0 flex-1 overflow-hidden border-primary/20 bg-card/92 shadow-ink backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-destructive/70" />
        <CardContent className="flex min-h-0 flex-1 p-0">
          <StudentChatClient
            key={chatClientKey}
            providerBlocked={workspace.data.providerBlocked}
            projectClassificationBlocked={workspace.data.projectClassificationBlocked}
            bloomClassificationBlocked={workspace.data.bloomClassificationBlocked}
            projects={projects}
            dailyArchive={workspace.data.dailyArchive}
            initialActiveProjectId={initialActiveProjectId}
            initialConversation={initialConversation}
          />
        </CardContent>
      </Card>
    </div>
  );
}
