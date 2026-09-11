'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { BookOpen, ChevronDown, FolderOpen, Loader2, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Sparkles, Swords, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AIMessageList, type MessageEditState } from '@/components/workbench/ai-message-list';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import type { BloomStatus } from '@/components/workbench/bloom-status-badge';
import type { DailyArchiveSummary, ProjectSummary, StudentConversationInitial } from '@/lib/data/student';
import {
  buildStudentChatRequestBody,
  buildStudentConversationHref,
  shouldClassifyProjectForStudentTurn,
  shouldReplaceStudentConversationHref,
  type StudentAssignmentData,
} from '@/lib/student-chat-contract';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse';
import { useSidebarScroll } from '@/hooks/use-sidebar-scroll';
import { useBloomStatus, type StudentBloomData } from '@/hooks/use-bloom-status';
import { useMessageQueue, type QueuedStudentMessage } from '@/hooks/use-message-queue';
import { useConversationSync } from '@/hooks/use-conversation-sync';
import { useStudentAssignment } from '@/hooks/use-student-assignment';

const globalPromptChips = ['《静夜思》的“疑”是什么意思？', '这句怎么翻译？', '诗人为什么这样写？', '帮我换一个分析角度追问'];
const finalizedConversationBlockedReason = '这条会话已完成教师审核，不能继续追问。请从篇目或空白入口新开会话。';

type StudentChatMessage = UIMessage<unknown, {
  'student-assignment': StudentAssignmentData;
  'student-bloom': StudentBloomData;
}>;

export function StudentChatClient({
  providerBlocked,
  projectClassificationBlocked,
  bloomClassificationBlocked,
  projects,
  dailyArchive,
  initialActiveProjectId,
  initialConversation,
}: {
  providerBlocked?: string;
  projectClassificationBlocked?: string;
  bloomClassificationBlocked?: string;
  projects: ProjectSummary[];
  dailyArchive: DailyArchiveSummary;
  initialActiveProjectId?: string;
  initialConversation?: StudentConversationInitial;
}) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState(initialConversation?.id ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [lastSubmittedInput, setLastSubmittedInput] = useState('');
  const [conversationLocked, setConversationLocked] = useState(Boolean(initialConversation?.conversationFinalized));
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; projectId?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapse();
  const sidebarScrollRef = useSidebarScroll();
  const { bloomStatus, applyBloomStatus, markQueued: markBloomQueued, markPending: markBloomPending, reset: resetBloomStatus } = useBloomStatus();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageCountRef = useRef(0);
  const initialConversationSignatureRef = useRef('');
  const conversationIdRef = useRef(conversationId);

  const syncConversationRoute = useCallback((nextConversationId: string) => {
    if (!nextConversationId) return;
    if (typeof window === 'undefined') return;
    if (shouldReplaceStudentConversationHref({
      currentPathname: window.location.pathname,
      currentSearch: window.location.search,
      conversationId: nextConversationId,
    })) {
      window.history.replaceState(null, '', buildStudentConversationHref(nextConversationId));
    }
  }, []);

  const refreshStudentRoute = useCallback((routeConversationId?: string) => {
    if (routeConversationId) syncConversationRoute(routeConversationId);
    router.refresh();
  }, [router, syncConversationRoute]);

  const acceptConversationId = useCallback((nextConversationId: string) => {
    setConversationId(nextConversationId);
    setConversationLocked(false);
    syncConversationRoute(nextConversationId);
  }, [syncConversationRoute]);

  // 会话归属接缝：项目状态、两条到达通路的汇合、归档回执与动效都在 hook 内。
  // busyRef 让归属回执与后台同步在流式期间只做前者：任何 router.refresh 都会让
  // 服务端 initialConversation 从无到有、翻转整机 key，流中 remount 即白屏。
  const busyRef = useRef(false);
  const assignment = useStudentAssignment({
    projects,
    conversationId,
    refreshRoute: refreshStudentRoute,
    initialProjectId: initialActiveProjectId ?? initialConversation?.projectId ?? '',
    isStreamingRef: busyRef,
  });
  const {
    activeProjectId,
    activeProjectIdRef,
    activeProjectTitleRef,
    expandedProjectIds,
    assignmentNotice,
    justArchivedProjectId,
    setNotice: setAssignmentNotice,
    acceptResponseHeaders,
    acceptAssignmentData,
    enterProject,
    toggleExpandedProject,
    resetToBlank,
    syncFromConversation,
  } = assignment;
  const chatFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    const nextConversationId = response.headers.get('x-conversation-id');

    if (response.status === 409) {
      const payload = await response.clone().json().catch(() => ({})) as { blockedReason?: string };
      if (payload.blockedReason === 'teacher_conversation_finalized') {
        setConversationLocked(true);
      }
    }
    if (nextConversationId) {
      acceptConversationId(nextConversationId);
    }
    // 通路一：首问即知归属（点项目开新会话），归属经响应 header 同步到达。
    acceptResponseHeaders(response.headers, nextConversationId ?? undefined);
    return response;
  }, [acceptConversationId, acceptResponseHeaders]);

  const chatTransport = useMemo(() => new DefaultChatTransport<StudentChatMessage>({
    api: '/api/student/chat',
    fetch: chatFetch,
  }), [chatFetch]);
  const initialConversationSignature = useMemo(() => initialConversation
    ? JSON.stringify({
      id: initialConversation.id,
      projectId: initialConversation.projectId ?? '',
      conversationFinalized: initialConversation.conversationFinalized,
      messages: initialConversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts,
      })),
    })
    : JSON.stringify({ projectId: initialActiveProjectId ?? '' }), [initialActiveProjectId, initialConversation]);

  const { messages, setMessages, sendMessage, regenerate, clearError, status, error, stop } = useChat<StudentChatMessage>({
    messages: initialConversation?.messages as StudentChatMessage[] | undefined,
    onData: (part) => {
      if (part.type === 'data-student-assignment') {
        // 通路二：空白首问的异步篇目识别，归属经流内 data part 到达。
        acceptAssignmentData(part.data);
      }
      if (part.type === 'data-student-bloom') {
        applyBloomStatus(part.data);
      }
    },
    onFinish: () => {
      refreshStudentRoute(conversationIdRef.current || conversationId);
    },
    onError: () => {
      refreshStudentRoute(conversationIdRef.current || conversationId);
    },
    transport: chatTransport,
  });
  const busy = status === 'submitted' || status === 'streaming';
  const activeProject = useMemo(() => projects.find((project) => project.id === activeProjectId), [activeProjectId, projects]);
  const inProjectContext = Boolean(activeProjectId);
  const projectDisplayName = activeProject?.title ? `《${activeProject.title}》` : '当前篇目';
  const promptChips = !inProjectContext
    ? globalPromptChips
    : activeProject?.title
      ? [`《${activeProject.title}》里这句怎么翻译？`, '这处字词是什么意思？', '作者为什么这样写？', '帮我换一个分析角度追问']
      : ['这句怎么翻译？', '这处字词是什么意思？', '作者为什么这样写？', '帮我换一个分析角度追问'];
  const classificationRequired = shouldClassifyProjectForStudentTurn({
    hasConversation: Boolean(conversationId),
    hasProject: inProjectContext,
  });
  const classificationUnavailable = classificationRequired ? projectClassificationBlocked : undefined;
  const bloomUnavailable = bloomClassificationBlocked;
  const composerValue = error && !input.trim() && lastSubmittedInput ? lastSubmittedInput : input;

  useEffect(() => {
    if (messages.length === 0) {
      messageCountRef.current = 0;
      return;
    }
    const grew = messages.length !== messageCountRef.current;
    messageCountRef.current = messages.length;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: grew ? 'smooth' : 'auto' });
  }, [messages]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const gatedSync = useCallback(() => {
    if (busyRef.current) return;
    refreshStudentRoute(conversationIdRef.current || conversationId);
  }, [conversationId, refreshStudentRoute]);

  useConversationSync(conversationId, gatedSync);

  const buildRequestBody = useCallback((fallback?: Record<string, unknown>) => buildStudentChatRequestBody({
    conversationId: conversationIdRef.current || conversationId,
    projectId: activeProjectIdRef.current || activeProjectId,
    projectTitle: activeProjectTitleRef.current || activeProject?.title,
    fallback,
  }), [activeProject?.title, activeProjectId, activeProjectIdRef, activeProjectTitleRef, conversationId]);

  const handleDequeue = useCallback((next: QueuedStudentMessage) => {
    setLastSubmittedInput(next.text);
    void sendMessage({ id: next.id, parts: [{ type: 'text', text: next.text }] }, { body: buildRequestBody(next.body) });
  }, [sendMessage, buildRequestBody]);

  const { queue: queuedMessages, queueCount, enqueue: enqueueMessage, clear: clearQueue } = useMessageQueue({
    busy,
    blocked: Boolean(providerBlocked) || conversationLocked,
    discard: conversationLocked,
    onDequeue: handleDequeue,
  });

  useEffect(() => {
    if (busy || initialConversationSignatureRef.current === initialConversationSignature) return;
    initialConversationSignatureRef.current = initialConversationSignature;

    setConversationId(initialConversation?.id ?? '');
    conversationIdRef.current = initialConversation?.id ?? '';
    setConversationLocked(Boolean(initialConversation?.conversationFinalized));
    syncFromConversation(initialConversation, initialActiveProjectId, projects);
    clearQueue();
    // 从服务端载入的历史消息 parts 里提取提问类型状态，恢复 bloomStatus，
    // 使历史会话也能渲染 BloomStatusBadge（而不只是流式期间才显示）。
    const initialBloomStatus: Record<string, BloomStatus> = {};
    for (const message of initialConversation?.messages ?? []) {
      if (message.role !== 'user') continue;
      const bloomPart = (message.parts ?? []).find(
        (part): part is { type: 'data-student-bloom'; data: StudentBloomData } =>
          typeof part === 'object' && part !== null && (part as Record<string, unknown>).type === 'data-student-bloom',
      );
      if (!bloomPart) continue;
      const { data } = bloomPart;
      initialBloomStatus[data.messageId] = data.state === 'classified'
        ? { state: 'classified', level: data.level }
        : data.state === 'failed'
          ? { state: 'failed', reason: data.reason }
          : { state: 'pending' };
    }
    resetBloomStatus(initialBloomStatus);
    setMessages((initialConversation?.messages ?? []) as StudentChatMessage[]);
  }, [busy, clearQueue, initialActiveProjectId, initialConversation, initialConversationSignature, projects, resetBloomStatus, setMessages, syncFromConversation]);

  const displayMessages = useMemo(
    () => [
      ...messages,
      ...queuedMessages.map((message) => ({
        id: message.id,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: message.text }],
      })),
    ],
    [messages, queuedMessages],
  );

  const openProjectContext = (projectId: string) => {
    enterProject(projectId);
    setConversationId('');
    conversationIdRef.current = '';
    setConversationLocked(false);
    resetBloomStatus();
    clearQueue();
    setUploadStatus('');
    setUploadError('');
    clearError();
    setMessages([]);
    window.history.replaceState(null, '', `/student?projectId=${projectId}`);
  };

  const openEmptyContext = () => {
    resetToBlank();
    setConversationId('');
    conversationIdRef.current = '';
    setConversationLocked(false);
    resetBloomStatus();
    clearQueue();
    setUploadStatus('');
    setUploadError('');
    clearError();
    setMessages([]);
    window.history.replaceState(null, '', '/student');
  };

  const uploadAttachment = async (file: File) => {
    if (uploading || providerBlocked || conversationLocked) return;
    setUploading(true);
    setUploadStatus('');
    setUploadError('');
    const form = new FormData();
    form.set('file', file);
    form.set('metadata', JSON.stringify(conversationId
      ? { workspace: 'student', conversationId }
      : {
          workspace: 'student',
          projectId: activeProjectId || undefined,
          projectTitle: activeProject?.title,
        }));
    try {
      const response = await fetch('/api/attachments', { method: 'POST', body: form });
      const payload = await response.json() as { ok?: boolean; message?: string; conversationId?: string; projectId?: string; fileName?: string; chunkCount?: number };
      if (!response.ok || !payload.ok) throw new Error(payload.message || '附件上传失败。');
      if (payload.conversationId) {
        acceptConversationId(payload.conversationId);
      }
      if (payload.projectId) {
        // 附件归属走的是与提问相同的接缝：项目态 + 回执 + 高亮动效。
        const matchedProject = projects.find((project) => project.id === payload.projectId);
        enterProject(payload.projectId);
        setAssignmentNotice({
          kind: 'project',
          title: matchedProject?.title ?? activeProject?.title ?? '对应篇目',
        });
      } else {
        setAssignmentNotice({ kind: 'archive' });
      }
      refreshStudentRoute(payload.conversationId);
      setUploadStatus(`${payload.fileName ?? file.name} 已上传，可用于当前会话`);
    } catch (uploadError) {
      setUploadError(uploadError instanceof Error ? uploadError.message : '附件上传失败。');
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const text = input.trim();
    if (!text || providerBlocked || conversationLocked) return;

    clearError();
    const body = buildRequestBody();
    const messageId = crypto.randomUUID();
    setLastSubmittedInput(text);
    if (busy) {
      enqueueMessage({ id: messageId, text, body });
      markBloomQueued(messageId);
    } else {
      void sendMessage({ id: messageId, parts: [{ type: 'text', text }] }, { body });
      if (activeProject && !bloomUnavailable) markBloomPending(messageId);
    }
    setInput('');
  };

  const retry = () => {
    if (!error || busy || conversationLocked) return;
    clearError();
    void regenerate({ body: buildRequestBody() });
  };

  // ── 会话中间节点编辑/回滚 ────────────────────────────────────────────────
  // 语义：以某条用户消息为节点，删除该节点及其后的全部消息（PATCH 端点），
  // 再以编辑后的文本重发。等价于"回到某节点改写上下文"，不做分支分叉。
  const [edit, setEdit] = useState<MessageEditState | null>(null);
  const [rollbackInFlight, setRollbackInFlight] = useState(false);

  const startEditUserMessage = (messageId: string, currentText: string) => {
    if (busyRef.current || conversationLocked || rollbackInFlight) return;
    setEdit({ messageId, value: currentText });
  };

  const cancelEdit = () => setEdit(null);

  const submitEdit = async () => {
    if (!edit || busyRef.current || rollbackInFlight) return;
    const text = edit.value.trim();
    if (!text) return;
    setRollbackInFlight(true);
    try {
      const response = await fetch('/api/student/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversationIdRef.current || conversationId, messageId: edit.messageId }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? '会话回滚失败。');
      const nodeIndex = messages.findIndex((message) => message.id === edit.messageId);
      setEdit(null);
      clearError();
      setMessages(nodeIndex === -1 ? [] : messages.slice(0, nodeIndex));
      // 会话已存在，服务端走普通追问路径；布鲁姆与归属在 onFinish 通路照常更新。
      void sendMessage({ id: crypto.randomUUID(), parts: [{ type: 'text', text }] }, { body: buildRequestBody() });
    } catch (editError) {
      toast.error(editError instanceof Error ? editError.message : '会话回滚失败。');
    } finally {
      setRollbackInFlight(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch('/api/student/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: deleteTarget.id }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? '会话删除失败。');
      if (conversationId === deleteTarget.id) {
        // 删除的是当前正在看的会话：若 AI 正在流式回答，
        // 先中断 useChat 的 fetch；后端 /api/student/chat 的 streamText
        // 会走 onAbort，不向已软删会话 insert 新的 assistant 消息（避免
        // 孤儿数据，也避免浪费已发起的 AI token）。
        if (busy) stop();
        if (deleteTarget.projectId) {
          openProjectContext(deleteTarget.projectId);
        } else {
          openEmptyContext();
        }
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (deleteError) {
      setDeleteError(deleteError instanceof Error ? deleteError.message : '会话删除失败。');
    } finally {
      setDeleting(false);
    }
  };

  const blocked = conversationLocked ? finalizedConversationBlockedReason : providerBlocked;

  return (
    <div className={cn("grid min-h-0 w-full flex-1 bg-background/35 transition-all duration-300", sidebarCollapsed ? "lg:grid-cols-[3.5rem_minmax(0,1fr)]" : "lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]")}>
      <aside ref={sidebarScrollRef} className={cn("order-2 border-t border-border/60 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_18%),color-mix(in_oklch,var(--card)_92%,transparent)] shadow-soft backdrop-blur-xl lg:order-1 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0 transition-all duration-300", sidebarCollapsed ? "lg:w-[3.5rem] lg:p-1.5" : "lg:w-auto lg:p-3")} aria-label="当前会话空间">
        {/* 收起态：窄图标栏（新会话 + 展开钮），悬停有 title 提示；展开态：新会话置顶。 */}
        <div className={cn('flex gap-2', sidebarCollapsed ? 'flex-col items-center' : 'flex-row items-stretch')}>
          <button
            type="button"
            onClick={openEmptyContext}
            title="开始新会话"
            className={cn('flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-[background-color,box-shadow,flex-direction] duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', sidebarCollapsed ? 'w-full px-0' : 'flex-1 px-4')}
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <span className={cn('truncate', sidebarCollapsed && 'sr-only')}>开始新会话</span>
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "展开篇目与会话" : "收起篇目与会话"}
            aria-label={sidebarCollapsed ? "展开篇目与会话" : "收起篇目与会话"}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        <div className={cn("space-y-4 pt-3 transition-opacity duration-300", sidebarCollapsed && "lg:hidden")}>
          <section className="rounded-2xl border border-border/65 bg-card/86 p-3 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
              <div>
                <p className="font-heading text-lg">篇目</p>
                <p className="mt-1 text-xs text-muted-foreground">选择篇目开始新会话；明确提到篇目时会自动归入。</p>
              </div>
              <Badge variant="outline">{projects.length}</Badge>
            </div>
            {projects.length === 0 ? (
              <EmptyState
                title="先自然提问"
                description="系统识别到篇目后会在这里保存学习记录。"
                className="bg-background/60"
              />
            ) : (
              <div className="space-y-2">
                {projects.map((project) => {
                  const active = project.id === activeProjectId;
                  const expanded = expandedProjectIds.includes(project.id);
                  const justArchived = project.id === justArchivedProjectId;
                  return (
                    <div key={project.id} className={cn('overflow-hidden rounded-xl border border-border/65 bg-background/76 shadow-soft transition-[border-color,background-color,box-shadow] duration-200', active && 'border-primary/55 bg-primary/7 shadow-ink ring-1 ring-primary/15', justArchived && 'border-primary/60 bg-primary/8 shadow-ink')}>
                      {/* 点击整行 = 展开/收起（多项目可同时展开）；进入篇目是展开面板里的显式动作。 */}
                      <button
                        type="button"
                        onClick={() => toggleExpandedProject(project.id)}
                        aria-expanded={expanded}
                        className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 px-3 py-3 text-left transition-colors duration-200 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex min-w-0 items-start gap-3">
                          <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200', active ? 'border-primary/25 bg-primary text-primary-foreground' : 'border-border/70 bg-card text-muted-foreground')}>
                            <FolderOpen className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-heading text-base">《{project.title}》</span>
                            <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
                              <span>{project.questionCount} 条提问</span>
                              <span>{project.challengeProgress.statusLabel}</span>
                            </span>
                          </span>
                        </span>
                        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                      </button>
                      {expanded ? (
                        <div className="space-y-1 border-t border-border/55 bg-card/45 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => openProjectContext(project.id)}
                            className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-primary/25 bg-primary/8 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Plus className="size-3.5 shrink-0" aria-hidden="true" />
                            在《{project.title}》下提问
                          </button>
                          {project.sessions.length === 0 ? <p className="rounded-lg border border-dashed bg-background/55 px-3 py-2 text-xs text-muted-foreground">暂无会话，可继续提问。</p> : null}
                          {project.sessions.map((session) => {
                            const current = session.id === conversationId;
                            return (
                              <div key={session.id} className={cn('group/session flex min-h-11 items-start gap-1 rounded-lg text-xs transition-colors duration-200 hover:bg-muted focus-within:bg-muted', current && 'bg-primary/8 text-primary')}>
                                <Link href={`/student?conversationId=${session.id}`} aria-current={current ? 'page' : undefined} className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-lg px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <MessageSquare className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium text-foreground">{session.title}</span>
                                    <span className="text-muted-foreground">{session.messageCount} 条消息 · {session.updatedLabel}</span>
                                  </span>
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => { setDeleteTarget({ id: session.id, title: session.title, projectId: project.id }); setDeleteError(''); }}
                                  className="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover/session:opacity-100 sm:group-focus-within/session:opacity-100"
                                  aria-label={`删除会话 ${session.title}`}
                                >
                                  <Trash2 className="size-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            );
                          })}
                          <Link
                            href={`/student/challenge?projectId=${project.id}`}
                            className="mt-1 flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-accent/45 bg-accent/8 px-2 py-2 text-xs text-accent-foreground/85 transition-colors hover:border-accent/70 hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Swords className="size-3.5 shrink-0" aria-hidden="true" />
                            挑战《{project.title}》
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/65 bg-card/86 p-3 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
              <div>
                <p className="font-heading text-lg">其他会话</p>
                <p className="mt-1 text-xs text-muted-foreground">未归入篇目的会话保存在这里，可回看续问。</p>
              </div>
              <Badge variant="secondary">{dailyArchive.sessions.length}</Badge>
            </div>
            {dailyArchive.sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-background/50 px-3 py-4 text-xs text-muted-foreground">
                暂无其他会话。
              </div>
            ) : (
              <div className="space-y-1 rounded-xl border bg-background/60 p-2">
                {dailyArchive.sessions.map((session) => {
                  const current = session.id === conversationId;
                  return (
                    <div key={session.id} className={cn('group/session flex min-h-11 items-start gap-1 rounded-lg text-xs text-muted-foreground transition-colors duration-200 hover:bg-muted focus-within:bg-muted', current && 'bg-primary/8 text-primary')}>
                      <Link href={`/student?conversationId=${session.id}`} aria-current={current ? 'page' : undefined} className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-lg px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <MessageSquare className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{session.title}</span>
                          <span>{session.messageCount} 条消息 · {session.updatedLabel}</span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setDeleteTarget({ id: session.id, title: session.title }); setDeleteError(''); }}
                        className="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover/session:opacity-100 sm:group-focus-within/session:opacity-100"
                        aria-label={`删除会话 ${session.title}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </aside>

      <section className="order-1 flex min-h-0 min-w-0 flex-col lg:order-2 lg:h-full" aria-label="学生学习提问空间">
        <div className="shrink-0 border-b border-border/60 bg-card/92 px-4 py-4 shadow-soft backdrop-blur sm:px-6 sm:py-5">
          <div className="mx-auto max-w-3xl space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="font-heading text-xl tracking-tight sm:text-2xl">{inProjectContext ? projectDisplayName : conversationId ? '其他会话' : '从一个古诗文问题开始'}</h2>
              <Badge className="border-primary/25 bg-primary/8 text-primary" variant="outline"><Sparkles className="mr-1 size-3" />{conversationLocked ? '教师已审核' : '学习提问'}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {conversationLocked
                ? '这条会话已完成教师核实，只能回看，不能继续追问。'
                : inProjectContext ? '新问题会直接归入当前篇目。' : conversationId ? '继续追问会保留在这条会话中；也可以从篇目或空白入口另开会话。' : '直接提问即可；问题中明确出现篇目时，系统会自动归入对应篇目。'}
            </p>
          </div>
        </div>
        <div className="order-2 border-t border-border/60 bg-card/92 p-4 shadow-[0_-18px_48px_-42px_rgba(26,26,46,0.55)] backdrop-blur sm:px-6 sm:py-5 lg:order-3">
          <div className="mx-auto max-w-3xl">
            <ChatComposer
              value={composerValue}
              onChange={setInput}
              onSubmit={submit}
              placeholder="直接输入你的古诗文问题…（Enter 发送，Shift+Enter 换行）"
              disabled={uploading || Boolean(blocked)}
              inputDisabled={uploading || conversationLocked}
              blockedReason={blocked}
              onFileUpload={uploadAttachment}
              uploadDisabled={busy || uploading || Boolean(blocked)}
              uploadStatus={uploadStatus}
              uploadError={uploadError}
            />
          </div>
        </div>
        <div ref={scrollRef} className="order-3 min-h-0 flex-1 overflow-y-auto px-4 py-7 lg:order-2">
          <div className="mx-auto max-w-3xl space-y-6">
            {classificationUnavailable ? (
              <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-muted-foreground">
                篇目识别暂不可用；从空白入口发起的新会话会先保存到其他会话，不影响继续提问。
              </div>
            ) : null}
            {bloomUnavailable ? (
              <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-muted-foreground">
                提问类型判断暂不可用；问题会照常保存，但暂不显示提问类型。
              </div>
            ) : null}
            {messages.length === 0 ? (
              <EmptyState
                title={inProjectContext ? `继续提问${activeProject?.title ? `《${activeProject.title}》` : '当前项目'}` : '把正在学的古诗文问题直接问出来'}
                description={inProjectContext
                  ? '这条新会话已归入当前篇目。'
                  : conversationId
                    ? '继续追问会保留在当前会话中。'
                    : '提到具体篇目时，系统会自动归入对应篇目；无法识别时会保存到其他会话。'}
                action={(
                  <div className="flex flex-wrap justify-center gap-2">
                    {promptChips.map((chip) => (
                      <Button key={chip} variant="outline" size="sm" disabled={conversationLocked} onClick={() => setInput(chip)}>
                        {chip}
                      </Button>
                    ))}
                  </div>
                )}
              />
            ) : (
              <AIMessageList
                messages={displayMessages}
                userBloomStatus={bloomStatus}
                edit={edit}
                canEditUserMessage={!conversationLocked && !busy && queueCount === 0 && !rollbackInFlight && Boolean(conversationId)}
                onEditStart={startEditUserMessage}
                onEditChange={(value) => setEdit((current) => (current ? { ...current, value } : current))}
                onEditSubmit={submitEdit}
                onEditCancel={cancelEdit}
              />
            )}
            {messages.length > 0 && assignmentNotice ? (
              <div className={cn('animate-in fade-in rounded-lg border px-4 py-3 text-sm duration-200', assignmentNotice.kind === 'project' ? 'border-primary/20 bg-primary/5' : 'bg-muted/50 text-muted-foreground')} aria-live="polite">
                <BookOpen className={cn('mr-2 inline size-4', assignmentNotice.kind === 'project' ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                {assignmentNotice.kind === 'project'
                  ? `已归入《${assignmentNotice.title}》。`
                  : '暂未识别到具体篇目，已保存到其他会话。'}
              </div>
            ) : null}
            {status === 'submitted' ? (
              // 等待首字：只有一串呼吸圆点，贴近主流 AI chatbot 的极简反馈；
              // 流式开始后正文本身在推进，不再叠状态卡片。
              <div className="flex items-center gap-1.5 py-2 pl-12" role="status" aria-label="正在思考">
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: `${dot * 150}ms` }} />
                ))}
              </div>
            ) : null}
            {queueCount > 0 ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">已排队 {queueCount} 条，将依次回答。</p>
            ) : null}
            {error ? (
              <ErrorState
                title="AI 响应失败"
                description={error.message}
                action={conversationLocked ? undefined : <Button type="button" variant="outline" onClick={retry}>重试本轮回答</Button>}
              />
            ) : null}
          </div>
        </div>
      </section>
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription>
              删除后，这条会话会从学习记录中移除；其中尚未完成教师审核的内容不再用于提问类型判断或挑战参考。已经形成的导出数据仍会保留。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">{deleteTarget?.title}</div>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={confirmDeleteSession}>
              {deleting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
