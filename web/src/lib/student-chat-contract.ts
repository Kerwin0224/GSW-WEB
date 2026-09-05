/**
 * 会话归属（assignment）在客户端的两条到达通路：
 * 1. 首问即知归属（点项目开新会话）→ HTTP 响应 header，先于流到达；
 * 2. 空白首问的异步篇目识别 → 流内 data-student-assignment part。
 * 两条路都汇入 useStudentAssignment 的同一处理函数。
 */
export type StudentAssignmentData =
  | { kind: 'project'; projectId: string; title: string }
  | { kind: 'archive'; projectId: null; title: null };

/** 可测试的 header 读取面：传 Response.headers 或任意 { get(name) } 形状。 */
export type AssignmentHeaderReader = { get: (name: string) => string | null };

/**
 * 从响应 header 解析归属结果。服务端只在"首问即知归属"时设置
 * x-assignment-kind；没有该 header 表示归属将经流内 part 异步到达，返回 null。
 */
export function parseAssignmentFromHeaders(headers: AssignmentHeaderReader): StudentAssignmentData | null {
  const kind = headers.get('x-assignment-kind');
  if (kind === 'archive') return { kind: 'archive', projectId: null, title: null };
  if (kind !== 'project') return null;
  const projectTitle = headers.get('x-project-title');
  if (!projectTitle) return null;
  return {
    kind: 'project',
    projectId: headers.get('x-project-id') ?? '',
    title: decodeURIComponent(projectTitle),
  };
}

export function shouldClassifyProjectForStudentTurn({
  hasConversation,
  hasProject,
  isRegeneration = false,
}: {
  hasConversation: boolean;
  hasProject: boolean;
  isRegeneration?: boolean;
}) {
  return !isRegeneration && !hasConversation && !hasProject;
}

export function getStudentChatBlockedReasons({
  providerBlocked,
  projectClassificationBlocked,
  bloomClassificationBlocked,
  projectClassificationRequired,
}: {
  providerBlocked?: string;
  projectClassificationBlocked?: string;
  bloomClassificationBlocked?: string;
  projectClassificationRequired: boolean;
}) {
  return [
    providerBlocked,
    projectClassificationRequired ? projectClassificationBlocked : undefined,
    bloomClassificationBlocked,
  ].filter((reason): reason is string => Boolean(reason));
}

export function buildStudentChatRequestBody({
  conversationId,
  projectId,
  projectTitle,
  fallback,
}: {
  conversationId?: string;
  projectId?: string;
  projectTitle?: string;
  fallback?: Record<string, unknown>;
}) {
  if (conversationId) return { conversationId };
  if (projectId) return projectTitle ? { projectId, projectTitle } : { projectId };
  return fallback ?? {};
}

export function buildStudentConversationHref(conversationId: string) {
  return `/student?conversationId=${encodeURIComponent(conversationId)}`;
}

export function shouldReplaceStudentConversationHref({
  currentPathname,
  currentSearch,
  conversationId,
}: {
  currentPathname: string;
  currentSearch: string;
  conversationId: string;
}) {
  const normalizedSearch = currentSearch && currentSearch.startsWith('?') ? currentSearch : currentSearch ? `?${currentSearch}` : '';
  return `${currentPathname || '/student'}${normalizedSearch}` !== buildStudentConversationHref(conversationId);
}
