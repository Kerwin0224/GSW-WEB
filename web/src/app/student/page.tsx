import { Card, CardContent } from '@/components/ui/card';
import { StudentChatClient } from '@/components/workbench/student-chat-client';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { getStudentConversation, getStudentProjects, getStudentWorkspace } from '@/lib/data/student';
import { listStudentSpaces } from '@/lib/data/spaces';
import { firstParam, parsePageParam } from '@/lib/pagination';

export default async function StudentChatPage({ searchParams }: { searchParams?: Promise<{ projectId?: string | string[]; conversationId?: string | string[]; spaceId?: string | string[]; q?: string | string[]; historyPage?: string | string[] }> }) {
  const params = await searchParams;
  const [spacesResult, conversationResult] = await Promise.all([
    listStudentSpaces(),
    firstParam(params?.conversationId) ? getStudentConversation(firstParam(params?.conversationId)!) : Promise.resolve(null),
  ]);

  if (!spacesResult.ok) {
    return <div className="p-6"><ErrorState title="学习空间加载失败" description={spacesResult.message} /></div>;
  }
  if (conversationResult && !conversationResult.ok) {
    return <div className="p-6"><ErrorState title="会话加载失败" description={conversationResult.message} /></div>;
  }

  const spaces = spacesResult.data;
  const initialConversation = conversationResult?.ok ? conversationResult.data ?? undefined : undefined;
  const requestedSpaceId = initialConversation?.spaceId ?? firstParam(params?.spaceId);
  const activeSpaceId = requestedSpaceId && spaces.some((space) => space.id === requestedSpaceId)
    ? requestedSpaceId
    : spaces[0]?.id ?? null;
  // 会话历史检索：查询词与页码都在 URL 里，所以搜索结果可分享、后退键能回到搜索前。
  const historyQuery = (firstParam(params?.q) ?? '').trim();
  const historyPage = parsePageParam(params?.historyPage);
  const [workspace, projectsResult] = await Promise.all([
    getStudentWorkspace({ spaceId: activeSpaceId, q: historyQuery, page: historyPage }),
    getStudentProjects({ spaceId: activeSpaceId }),
  ]);

  if (!workspace.ok) {
    return <div className="p-6"><ErrorState title="学习提问加载失败" description={workspace.message} /></div>;
  }

  const projects = projectsResult.ok ? projectsResult.data : [];
  const initialActiveProjectId = initialConversation
    ? initialConversation.projectId
    : firstParam(params?.projectId) && projects.some((project) => project.id === firstParam(params?.projectId))
      ? firstParam(params?.projectId)!
      : undefined;
  // 检索与翻页刻意不进 key：它们只改侧栏的历史列表。进 key 的话，翻一页就会把正在读的会话整个重挂载掉。
  const chatClientKey = `${activeSpaceId ?? 'unscoped'}|${initialConversation?.id ?? initialActiveProjectId ?? 'blank'}|${initialConversation?.conversationLocked ? 'locked' : 'open'}`;
  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-[100rem] flex-col px-3 py-3 sm:px-5 lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden">
      <Card className="relative flex min-h-0 flex-1 overflow-hidden border-primary/20 bg-card/92 shadow-ink backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-destructive/70" />
        <CardContent className="flex min-h-0 flex-1 p-0">
          <StudentChatClient
            key={chatClientKey}
            providerBlocked={workspace.data.providerBlocked}
            projectClassificationBlocked={workspace.data.projectClassificationBlocked}
            bloomClassificationBlocked={workspace.data.bloomClassificationBlocked}
            projects={projects}
            history={workspace.data.history}
            starterPrompts={workspace.data.starterPrompts}
            initialActiveProjectId={initialActiveProjectId}
            initialConversation={initialConversation}
            spaces={spaces}
            activeSpaceId={activeSpaceId ?? ''}
          />
        </CardContent>
      </Card>
    </div>
  );
}
