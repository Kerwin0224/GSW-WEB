'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { BookOpen, ChevronDown, FolderOpen, Loader2, MessageSquare, PanelLeftClose, PanelLeftOpen, Sparkles, Trash2 } from 'lucide-react';

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
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import type { BloomStatus } from '@/components/workbench/bloom-status-badge';
import type { DailyArchiveSummary, ProjectSummary, StudentConversationInitial } from '@/lib/data/student';
import {
  buildStudentChatRequestBody,
  buildStudentConversationHref,
  shouldClassifyProjectForStudentTurn,
  shouldReplaceStudentConversationHref,
} from '@/lib/student-chat-contract';
import { cn } from '@/lib/utils';
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse';
import { useBloomStatus, type StudentBloomData } from '@/hooks/use-bloom-status';
import { useMessageQueue, type QueuedStudentMessage } from '@/hooks/use-message-queue';
import { useConversationSync } from '@/hooks/use-conversation-sync';

const globalPromptChips = ['《静夜思》的“疑”是什么意思？', '这句怎么翻译？', '诗人为什么这样写？', '帮我从分析层级继续追问'];
const finalizedConversationBlockedReason = '这条会话已完成教师核实，不能继续追问。请从项目或空白入口新开一个会话继续学习。';
type StudentAssignmentData =
  | { kind: 'project'; projectId: string; title: string }
  | { kind: 'archive'; projectId: null; title: null };
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
  const [activeProjectId, setActiveProjectId] = useState(initialActiveProjectId ?? initialConversation?.projectId ?? '');
  const [assignmentNotice, setAssignmentNotice] = useState<{ kind: 'project'; title: string } | { kind: 'archive' } | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState(initialActiveProjectId ?? initialConversation?.projectId ?? '');
  const { bloomStatus, applyBloomStatus, markQueued: markBloomQueued, markPending: markBloomPending, reset: resetBloomStatus } = useBloomStatus();
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialConversationSignatureRef = useRef('');
  const conversationIdRef = useRef(conversationId);
  const activeProjectIdRef = useRef(activeProjectId);
  const activeProjectTitleRef = useRef(activeProjectId ? projects.find((project) => project.id === activeProjectId)?.title : undefined);
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
  const applyAssignment = useCallback((assignment: StudentAssignmentData, routeConversationId = conversationId) => {
    if (assignment.kind === 'project') {
      let nextProjectId = assignment.projectId;
      if (assignment.projectId) {
        setActiveProjectId(assignment.projectId);
        setExpandedProjectId(assignment.projectId);
      } else {
        const matchedProject = projects.find((project) => project.title === assignment.title);
        if (matchedProject) {
          nextProjectId = matchedProject.id;
          setActiveProjectId(matchedProject.id);
          setExpandedProjectId(matchedProject.id);
        }
      }
      const alreadyInProjectContext = Boolean(nextProjectId) && activeProjectId === nextProjectId;
      if (!alreadyInProjectContext) setAssignmentNotice({ kind: 'project', title: assignment.title });
      refreshStudentRoute(routeConversationId);
      return;
    }

    setAssignmentNotice({ kind: 'archive' });
    refreshStudentRoute(routeConversationId);
  }, [activeProjectId, conversationId, projects, refreshStudentRoute]);

  const chatFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    const nextConversationId = response.headers.get('x-conversation-id');
    const assignmentKind = response.headers.get('x-assignment-kind');
    const projectId = response.headers.get('x-project-id');
    const projectTitle = response.headers.get('x-project-title');

    if (response.status === 409) {
      const payload = await response.clone().json().catch(() => ({})) as { blockedReason?: string };
      if (payload.blockedReason === 'teacher_conversation_finalized') {
        setConversationLocked(true);
        clearQueue();
      }
    }
    if (nextConversationId) {
      acceptConversationId(nextConversationId);
    }
    if (assignmentKind === 'project' && projectTitle) {
      applyAssignment({ kind: 'project', projectId: projectId ?? '', title: decodeURIComponent(projectTitle) }, nextConversationId ?? undefined);
    }
    if (assignmentKind === 'archive') {
      applyAssignment({ kind: 'archive', projectId: null, title: null }, nextConversationId ?? undefined);
    }
    return response;
  }, [acceptConversationId, applyAssignment]);

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
        applyAssignment(part.data);
      }
      if (part.type === 'data-student-bloom') {
        applyBloomStatus(part.data);
      }
    },
    onFinish: () => {
      refreshStudentRoute(conversationId);
    },
    transport: chatTransport,
  });
  const busy = status === 'submitted' || status === 'streaming';
  const activeProject = useMemo(() => projects.find((project) => project.id === activeProjectId), [activeProjectId, projects]);
  const inProjectContext = Boolean(activeProjectId);
  const projectDisplayName = activeProject?.title ? `《${activeProject.title}》项目` : '当前项目';
  const promptChips = !inProjectContext
    ? globalPromptChips
    : activeProject?.title
      ? [`《${activeProject.title}》里这句怎么翻译？`, '这处字词是什么意思？', '作者为什么这样写？', '帮我从分析层级继续追问']
      : ['这句怎么翻译？', '这处字词是什么意思？', '作者为什么这样写？', '帮我从分析层级继续追问'];
  const classificationRequired = shouldClassifyProjectForStudentTurn({
    hasConversation: Boolean(conversationId),
    hasProject: inProjectContext,
  });
  const classificationUnavailable = classificationRequired ? projectClassificationBlocked : undefined;
  const bloomUnavailable = bloomClassificationBlocked;
  const composerValue = error && !input.trim() && lastSubmittedInput ? lastSubmittedInput : input;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (busy || initialConversationSignatureRef.current === initialConversationSignature) return;
    initialConversationSignatureRef.current = initialConversationSignature;

    setConversationId(initialConversation?.id ?? '');
    conversationIdRef.current = initialConversation?.id ?? '';
    setConversationLocked(Boolean(initialConversation?.conversationFinalized));
    const nextProjectId = initialConversation?.projectId ?? initialActiveProjectId ?? '';
    setActiveProjectId(nextProjectId);
    activeProjectIdRef.current = nextProjectId;
    activeProjectTitleRef.current = nextProjectId ? projects.find((project) => project.id === nextProjectId)?.title : undefined;
    setExpandedProjectId(nextProjectId);
    clearQueue();
    // 从服务端载入的历史消息 parts 里提取布鲁姆认知路径状态，恢复 bloomStatus，
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
  }, [busy, initialActiveProjectId, initialConversation, initialConversationSignature, projects, setMessages, resetBloomStatus]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
    activeProjectTitleRef.current = activeProject?.title;
  }, [activeProjectId, activeProject?.title]);

  useEffect(() => {
    if (!assignmentNotice) return;
    const timer = window.setTimeout(() => setAssignmentNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [assignmentNotice]);

  useConversationSync(conversationId, useCallback(() => refreshStudentRoute(conversationId), [conversationId, refreshStudentRoute]));

  const buildRequestBody = useCallback((fallback?: Record<string, unknown>) => buildStudentChatRequestBody({
    conversationId: conversationIdRef.current || conversationId,
    projectId: activeProjectIdRef.current || activeProjectId,
    projectTitle: activeProjectTitleRef.current || activeProject?.title,
    fallback,
  }), [activeProject?.title, activeProjectId, conversationId]);

  const handleDequeue = useCallback((next: QueuedStudentMessage) => {
    setLastSubmittedInput(next.text);
    void sendMessage({ id: next.id, parts: [{ type: 'text', text: next.text }] }, { body: buildRequestBody(next.body) });
  }, [sendMessage, buildRequestBody]);

  const { queue: queuedMessages, queueCount, enqueue: enqueueMessage, clear: clearQueue } = useMessageQueue({
    busy,
    blocked: Boolean(providerBlocked) || conversationLocked,
    onDequeue: handleDequeue,
  });

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
    setActiveProjectId(projectId);
    activeProjectIdRef.current = projectId;
    activeProjectTitleRef.current = projects.find((project) => project.id === projectId)?.title;
    setExpandedProjectId(projectId);
    setConversationId('');
    conversationIdRef.current = '';
    setConversationLocked(false);
    resetBloomStatus();
    clearQueue();
    setAssignmentNotice(null);
    setUploadStatus('');
    setUploadError('');
    clearError();
    setMessages([]);
    window.history.replaceState(null, '', `/student?projectId=${projectId}`);
  };

  const openEmptyContext = () => {
    setActiveProjectId('');
    activeProjectIdRef.current = '';
    activeProjectTitleRef.current = undefined;
    setExpandedProjectId('');
    setConversationId('');
    conversationIdRef.current = '';
    setConversationLocked(false);
    resetBloomStatus();
    clearQueue();
    setAssignmentNotice(null);
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
    const uploadStartTime = Date.now();
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
        const matchedProject = projects.find((project) => project.id === payload.projectId);
        setActiveProjectId(payload.projectId);
        setExpandedProjectId(payload.projectId);
        if (matchedProject) {
          setAssignmentNotice({ kind: 'project', title: matchedProject.title });
        } else {
          setAssignmentNotice({ kind: 'project', title: activeProject?.title ?? '对应篇目' });
        }
      } else {
        setAssignmentNotice({ kind: 'archive' });
      }
      refreshStudentRoute(payload.conversationId);
      const elapsedSeconds = Math.round((Date.now() - uploadStartTime) / 1000);
      setUploadStatus(`已上传《${payload.fileName ?? file.name}》，生成 ${payload.chunkCount ?? 0} 段检索片段（耗时约 ${elapsedSeconds} 秒）。`);
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
      if (activeProjectId) setExpandedProjectId(activeProjectId);
      if (activeProject && !bloomUnavailable) markBloomPending(messageId);
    }
    if (activeProjectId) setExpandedProjectId(activeProjectId);
    setInput('');
  };

  const retry = () => {
    if (!error || busy || conversationLocked) return;
    clearError();
    if (activeProjectId) setExpandedProjectId(activeProjectId);
    void regenerate({ body: buildRequestBody() });
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
  const currentSpaceLabel = inProjectContext ? projectDisplayName : conversationId ? '日常会话归档' : '空白提问入口';

  return (
    <div className={cn("grid min-h-0 w-full flex-1 bg-background/35 transition-all duration-300", sidebarCollapsed ? "lg:grid-cols-[3rem_minmax(0,1fr)]" : "lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]")}>
      <aside className={cn("order-2 border-t border-border/60 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_18%),color-mix(in_oklch,var(--card)_92%,transparent)] p-3 shadow-soft backdrop-blur-xl lg:order-1 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto lg:border-r lg:border-t-0 transition-all duration-300", sidebarCollapsed ? "lg:p-2" : "lg:p-4")} aria-label="当前会话空间">
        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden lg:flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        <div className={cn("space-y-4 pb-3 transition-opacity duration-300", sidebarCollapsed && "lg:hidden")}>
          <section className="rounded-2xl border border-primary/18 bg-background/72 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">学习空间</p>
                <h2 className="mt-2 font-heading text-xl tracking-tight">{currentSpaceLabel}</h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">项目对应具体篇目；无法可靠归属的会话保存在日常会话归档。</p>
              </div>
              <Badge className="border-primary/25 bg-primary/8 text-primary" variant="outline">当前</Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border border-border/60 bg-card/80 px-2 py-2">
                <span className="block font-heading text-lg text-foreground">{projects.length}</span>
                <span className="text-muted-foreground">项目</span>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/80 px-2 py-2">
                <span className="block font-heading text-lg text-foreground">{projects.reduce((sum, project) => sum + project.questionCount, 0)}</span>
                <span className="text-muted-foreground">问题</span>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/80 px-2 py-2">
                <span className="block font-heading text-lg text-foreground">{dailyArchive.sessions.length}</span>
                <span className="text-muted-foreground">归档会话</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border/65 bg-card/86 p-3 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
              <div>
                <p className="font-heading text-lg">项目</p>
                <p className="mt-1 text-xs text-muted-foreground">点击项目会开启该篇目的新会话。</p>
              </div>
              <Badge variant="outline">{projects.length}</Badge>
            </div>
            {projects.length === 0 ? (
              <EmptyState
                title="先自然提问"
                description="系统会在识别到篇目后自动归档；无法识别时会提示原因。"
                className="bg-background/60"
              />
            ) : (
              <div className="space-y-2">
                {projects.map((project) => {
                  const active = project.id === activeProjectId;
                  const expanded = project.id === expandedProjectId;
                  return (
                    <div key={project.id} className={cn('overflow-hidden rounded-xl border border-border/65 bg-background/76 shadow-soft transition-[border-color,background-color,box-shadow] duration-200', active && 'border-primary/55 bg-primary/7 shadow-ink ring-1 ring-primary/15')}>
                      <button
                        type="button"
                        onClick={() => openProjectContext(project.id)}
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
                              <span>{project.questionCount} 个问题</span>
                              <span>{project.challengeProgress.statusLabel}</span>
                            </span>
                          </span>
                        </span>
                        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                      </button>
                      {expanded ? (
                        <div className="space-y-1 border-t border-border/55 bg-card/45 px-3 py-2">
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
                <p className="font-heading text-lg">日常会话归档</p>
                <p className="mt-1 text-xs text-muted-foreground">无法可靠归属篇目的会话会保存在这里，可回看并续问。</p>
              </div>
              <Badge variant="secondary">{dailyArchive.sessions.length}</Badge>
            </div>
            <button
              type="button"
              onClick={openEmptyContext}
              className={cn('mb-2 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-left text-xs transition-[border-color,background-color,color] duration-200 hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !activeProjectId && !conversationId && 'border-primary/45 bg-primary/7 text-primary')}
            >
              <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
              从全局空白入口开始新会话
            </button>
            {dailyArchive.sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-background/50 px-3 py-4 text-xs text-muted-foreground">
                暂无日常会话归档。
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
                          <span>日常会话 · {session.messageCount} 条消息 · {session.updatedLabel}</span>
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

      <section className="order-1 flex max-h-[calc(100svh-8rem)] min-w-0 flex-col lg:order-2 lg:max-h-[calc(100svh-5rem)]" aria-label="学生学习提问空间">
        <div className="border-b border-border/60 bg-card/92 px-4 py-4 shadow-soft backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">当前会话空间</p>
              <p className="font-heading text-2xl tracking-tight">{inProjectContext ? projectDisplayName : conversationId ? '日常会话归档' : '从一个古诗文问题开始'}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {conversationLocked
                  ? '这条会话已完成教师核实，只能回看，不能继续追问。'
                  : inProjectContext ? '你现在正在对应篇目的项目里继续学习；新问题直接归入当前项目，不再进行篇目识别。' : conversationId ? '这条会话不会补归属到项目；若要进入篇目学习流，请从项目或空白入口另开新会话。' : '直接提问即可；当问题里明确出现篇目时，系统会自动归入对应项目。'}
              </p>
            </div>
            <Badge className="w-fit border-primary/25 bg-primary/8 text-primary" variant="outline"><Sparkles className="mr-1 size-3" />{conversationLocked ? '教师已核实' : '项目与归档并列'}</Badge>
          </div>
        </div>
        <div className="order-2 border-t border-border/60 bg-card/92 p-4 shadow-[0_-18px_48px_-42px_rgba(26,26,46,0.55)] backdrop-blur lg:order-3">
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
            {providerBlocked ? <BlockedState title="学生 AI 能力未就绪" description={providerBlocked} /> : null}
            {classificationUnavailable ? (
              <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-muted-foreground">
                篇目识别能力暂未就绪；从全局空白入口发起的新会话会先保存到日常会话归档，不影响继续提问。
              </div>
            ) : null}
            {bloomUnavailable ? (
              <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-muted-foreground">
                布鲁姆认知路径判断暂未就绪；项目问题会先照常保存，稍后不显示路径层级反馈。
              </div>
            ) : null}
            {messages.length === 0 ? (
              <EmptyState
                title={inProjectContext ? `继续提问${activeProject?.title ? `《${activeProject.title}》` : '当前项目'}` : '把正在学的古诗文问题直接问出来'}
                description={inProjectContext
                  ? '这条新会话已经在当前项目下，首问会直接继承该项目，不触发篇目识别或篇目冲突检测。'
                  : conversationId
                    ? '这是日常会话归档中的历史会话，继续追问只延续当前会话，不会补归属到项目。'
                    : '第一屏从空白提问开始，不默认替你选最近项目。提到具体篇目时，系统会自动归入对应项目；无法可靠识别时会保存到日常会话归档。'}
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
              <AIMessageList messages={displayMessages} userBloomStatus={bloomStatus} />
            )}
            {messages.length > 0 && assignmentNotice ? (
              <div className={cn('rounded-lg border px-4 py-3 text-sm', assignmentNotice.kind === 'project' ? 'border-primary/20 bg-primary/5' : 'bg-muted/50 text-muted-foreground')} aria-live="polite">
                <BookOpen className={cn('mr-2 inline size-4', assignmentNotice.kind === 'project' ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                {assignmentNotice.kind === 'project'
                  ? `已归入《${assignmentNotice.title}》项目。`
                  : '暂未可靠识别到具体篇目，已保存到日常会话归档。'}
              </div>
            ) : null}
            {busy ? (
              <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="size-4 animate-spin" />
                {status === 'submitted' ? '已提交，等待模型首个响应…' : queueCount > 0 ? `AI 正在回答，后续 ${queueCount} 条已排队。` : 'AI 正在流式回答…'}
              </div>
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
              删除后，这条会话会从学生侧移除；未被教师确认无误或修订回答的内容不再进入学习记录核实、布鲁姆认知路径或挑战依据，已形成导出样本的后台数据仍保留。
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
