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
