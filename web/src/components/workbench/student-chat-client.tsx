'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { BookOpen, ChevronDown, Loader2, MessageSquare, Route, Sparkles, Swords } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { BloomBadge, bloomLevelInfo } from '@/components/workbench/bloom-badge';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import type { BloomStatus } from '@/components/workbench/bloom-status-badge';
import type { DailyArchiveSummary, ProjectSummary } from '@/lib/data/student';
import { cn } from '@/lib/utils';

const promptChips = ['《静夜思》的“疑”是什么意思？', '这句怎么翻译？', '诗人为什么这样写？', '帮我从分析层级继续追问'];

export function StudentChatClient({
  providerBlocked,
  classificationBlocked,
  projects,
  dailyArchive,
  initialActiveProjectId,
}: {
  providerBlocked?: string;
  classificationBlocked?: string;
  projects: ProjectSummary[];
  dailyArchive: DailyArchiveSummary;
  initialActiveProjectId?: string;
}) {
  const [input, setInput] = useState('');
  const [activeProjectId, setActiveProjectId] = useState(initialActiveProjectId ?? '');
  const [assignmentNotice, setAssignmentNotice] = useState<{ kind: 'project'; title: string } | { kind: 'archive' } | { kind: 'project-switch'; title: string } | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState(initialActiveProjectId ?? '');
  const [bloomStatus, setBloomStatus] = useState<Record<string, BloomStatus>>({});
  const [conversationId, setConversationId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [lastSubmittedInput, setLastSubmittedInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, setMessages, sendMessage, regenerate, clearError, status, error } = useChat({

    transport: new DefaultChatTransport({
      api: '/api/student/chat',
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        const nextConversationId = response.headers.get('x-conversation-id');
        const assignmentKind = response.headers.get('x-assignment-kind');
        const projectId = response.headers.get('x-project-id');
        const projectTitle = response.headers.get('x-project-title');

        if (nextConversationId) setConversationId(nextConversationId);
        if (assignmentKind === 'project' && projectTitle) {
          const title = decodeURIComponent(projectTitle);
          const matchedProject = projectId
            ? projects.find((project) => project.id === projectId)
            : projects.find((project) => project.title === title);
          if (matchedProject) {
            setActiveProjectId(matchedProject.id);
            setExpandedProjectId(matchedProject.id);
          }
          setAssignmentNotice({ kind: 'project', title });
        }
        if (assignmentKind === 'project-switch' && projectTitle) {
          const title = decodeURIComponent(projectTitle);
          const matchedProject = projectId
            ? projects.find((project) => project.id === projectId)
            : projects.find((project) => project.title === title);
          setMessages([]);
          setBloomStatus({});
          if (matchedProject) {
            setActiveProjectId(matchedProject.id);
            setExpandedProjectId(matchedProject.id);
          }
          setAssignmentNotice({ kind: 'project-switch', title });
        }
        if (assignmentKind === 'archive') {
          setAssignmentNotice({ kind: 'archive' });
        }
        return response;
      },
    }),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const activeProject = useMemo(() => projects.find((project) => project.id === activeProjectId), [activeProjectId, projects]);
  const composerValue = error && !input.trim() && lastSubmittedInput ? lastSubmittedInput : input;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!assignmentNotice) return;
    const timer = window.setTimeout(() => setAssignmentNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [assignmentNotice]);

  const buildRequestBody = () => ({
    ...(conversationId ? { conversationId } : {}),
    ...(activeProjectId ? { projectId: activeProjectId, projectTitle: activeProject?.title } : {}),
  });

  const openProjectContext = (projectId: string) => {
    setActiveProjectId(projectId);
    setExpandedProjectId(projectId);
    setConversationId('');
    setBloomStatus({});
    setAssignmentNotice(null);
    clearError();
    setMessages([]);
  };

  const uploadAttachment = async (file: File) => {
    if (uploading || providerBlocked || classificationBlocked) return;
    setUploading(true);
    setUploadStatus('');
    setUploadError('');
    const form = new FormData();
    form.set('file', file);
    form.set('metadata', JSON.stringify({
      workspace: 'student',
      conversationId: conversationId || undefined,
      projectId: activeProjectId || undefined,
      projectTitle: activeProject?.title,
    }));
    try {
      const response = await fetch('/api/attachments', { method: 'POST', body: form });
      const payload = await response.json() as { ok?: boolean; message?: string; conversationId?: string; projectId?: string; fileName?: string; chunkCount?: number };
      if (!response.ok || !payload.ok) throw new Error(payload.message || '附件上传失败。');
      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.projectId) {
        const matchedProject = projects.find((project) => project.id === payload.projectId);
        if (matchedProject) {
          setActiveProjectId(matchedProject.id);
          setExpandedProjectId(matchedProject.id);
          setAssignmentNotice({ kind: 'project', title: matchedProject.title });
        } else {
          setAssignmentNotice({ kind: 'archive' });
        }
      } else {
        setAssignmentNotice({ kind: 'archive' });
      }
      setUploadStatus(`已上传《${payload.fileName ?? file.name}》，生成 ${payload.chunkCount ?? 0} 段仅限当前会话检索的附件片段。`);
    } catch (uploadError) {
      setUploadError(uploadError instanceof Error ? uploadError.message : '附件上传失败。');
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const text = input.trim();
    if (!text || busy || providerBlocked || classificationBlocked) return;

    clearError();
    const body = buildRequestBody();
    const messageId = crypto.randomUUID();
    setLastSubmittedInput(text);
    sendMessage({ id: messageId, parts: [{ type: 'text', text }] }, { body });
    if (activeProjectId) setExpandedProjectId(activeProjectId);
    if (activeProject) setBloomStatus((current) => ({ ...current, [messageId]: { state: 'pending' } }));
    setInput('');
  };

  const retry = () => {
    if (!error || busy) return;
    clearError();
    if (activeProjectId) setExpandedProjectId(activeProjectId);
    void regenerate({ body: buildRequestBody() });
  };

  const blocked = providerBlocked || classificationBlocked;

  const sessionStatusItems = Object.entries(bloomStatus);
  const confirmedLevel = activeProject?.challengeProgress.confirmedLevel;
  const nextLevel = activeProject?.challengeProgress.nextLevel ?? 1;

  return (
    <div className="grid min-h-0 w-full flex-1 bg-background/35 lg:grid-cols-[19rem_minmax(0,1fr)_18rem] xl:grid-cols-[21rem_minmax(0,1fr)_20rem]">
      <section className="order-1 flex min-h-[calc(100svh-8rem)] min-w-0 flex-col lg:order-2 lg:min-h-0" aria-label="学生学习提问空间">
        <div className="border-b border-border/60 bg-card/92 px-4 py-4 shadow-soft backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">当前学习上下文</p>
              <p className="font-heading text-2xl tracking-tight">{activeProject ? `《${activeProject.title}》项目` : '从一个古诗文问题开始'}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {activeProject ? '你现在正在对应篇目的项目里继续追问。' : '直接提问即可；当问题里明确出现篇目时，系统会自动归入对应项目。'}
              </p>
            </div>
            <Badge className="w-fit border-primary/25 bg-primary/8 text-primary" variant="outline"><Sparkles className="mr-1 size-3" />项目优先组织会话</Badge>
          </div>
        </div>
        <div className="order-2 border-t border-border/60 bg-card/92 p-4 shadow-[0_-18px_48px_-42px_rgba(26,26,46,0.55)] backdrop-blur lg:order-3">
          <div className="mx-auto max-w-3xl">
            <ChatComposer
              value={composerValue}
              onChange={setInput}
              onSubmit={submit}
              placeholder="直接输入你的古诗文问题…（Enter 发送，Shift+Enter 换行）"
              disabled={busy || Boolean(blocked)}
              inputDisabled={busy}
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
            {classificationBlocked ? <BlockedState title="篇目识别能力未就绪" description={classificationBlocked} /> : null}
            {messages.length === 0 ? (
              <EmptyState
                title="把正在学的古诗文问题直接问出来"
                description="第一屏从空白提问开始，不默认替你选最近项目。提到具体篇目时，系统会自动归入对应项目；无法可靠识别时会保存到日常会话归档。"
                action={(
                  <div className="flex flex-wrap justify-center gap-2">
                    {promptChips.map((chip) => (
                      <Button key={chip} variant="outline" size="sm" onClick={() => setInput(chip)}>
                        {chip}
                      </Button>
                    ))}
                  </div>
                )}
              />
            ) : (
              <AIMessageList messages={messages} userBloomStatus={bloomStatus} />
            )}
            {messages.length > 0 && assignmentNotice ? (
              <div className={cn('rounded-lg border px-4 py-3 text-sm', assignmentNotice.kind === 'project' || assignmentNotice.kind === 'project-switch' ? 'border-primary/20 bg-primary/5' : 'bg-muted/50 text-muted-foreground')} aria-live="polite">
                <BookOpen className={cn('mr-2 inline size-4', assignmentNotice.kind === 'project' || assignmentNotice.kind === 'project-switch' ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                {assignmentNotice.kind === 'project'
                  ? `已归入《${assignmentNotice.title}》项目。`
                  : assignmentNotice.kind === 'project-switch'
                    ? `已开始《${assignmentNotice.title}》新会话。`
                    : '暂未可靠识别到具体篇目，已保存到日常会话归档。'}
              </div>
            ) : null}
            {busy ? (
              <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="size-4 animate-spin" />
                {status === 'submitted' ? '已提交，等待模型首个响应…' : 'AI 正在流式回答…'}
              </div>
            ) : null}
            {error ? (
              <ErrorState
                title="AI 响应失败"
                description={error.message}
                action={<Button type="button" variant="outline" onClick={retry}>重试本轮回答</Button>}
              />
            ) : null}
          </div>
        </div>
      </section>

      <aside className="order-2 max-h-none overflow-y-visible border-t bg-card/80 p-4 lg:order-1 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto lg:border-r lg:border-t-0" aria-label="篇目项目">
        <div className="space-y-5 pb-3">
          <section>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-lg">篇目项目</p>
                <p className="mt-1 text-xs text-muted-foreground">项目为第一层，会话沉淀在篇目之下。</p>
              </div>
              <Badge variant="outline">{projects.length}</Badge>
            </div>
            {projects.length === 0 ? (
              <EmptyState
                title="先自然提问"
                description="系统会在识别到明确篇目后自动归入项目；缺少识别能力时会诚实显示阻塞原因。"
                className="bg-background/60"
              />
            ) : (
              <div className="space-y-3">
                {projects.map((project) => {
                  const active = project.id === activeProjectId;
                  const expanded = project.id === expandedProjectId;
                  return (
                    <div key={project.id} className={cn('rounded-lg border border-border/65 bg-background/72 shadow-soft transition-[border-color,background-color,box-shadow] duration-200', active && 'border-primary/55 bg-primary/6 shadow-ink')}>
                      <button
                        type="button"
                        onClick={() => openProjectContext(project.id)}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-3 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span>
                          <span className="block font-heading text-base">《{project.title}》</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {project.questionCount} 个问题 · {project.sessions.length} 条会话 · {project.challengeProgress.statusLabel}
                          </span>
                        </span>
                        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                      </button>
                      {expanded ? (
                        <div className="space-y-1 border-t border-border/55 px-3 py-2">
                          {project.sessions.length === 0 ? <p className="text-xs text-muted-foreground">暂无会话，继续提问后会自动出现。</p> : null}
                          {project.sessions.map((session) => (
                            <a key={session.id} href={`/student/projects/${project.id}`} className="flex items-start gap-2 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <MessageSquare className="mt-0.5 size-3.5 text-primary" aria-hidden="true" />
                              <span>
                                <span className="block font-medium">{session.title}</span>
                                <span className="text-muted-foreground">{session.messageCount} 条记录 · {session.updatedLabel}</span>
                              </span>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-base text-muted-foreground">日常会话归档</p>
                <p className="mt-1 text-xs text-muted-foreground">无法可靠归属篇目的会话会先保存在这里。</p>
              </div>
              <Badge variant="secondary">{dailyArchive.sessions.length}</Badge>
            </div>
            {dailyArchive.sessions.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background/50 px-3 py-4 text-xs text-muted-foreground">
                暂无日常会话归档。
              </div>
            ) : (
              <div className="space-y-1 rounded-lg border bg-background/60 p-2">
                {dailyArchive.sessions.map((session) => (
                  <div key={session.id} className="flex items-start gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground">
                    <MessageSquare className="mt-0.5 size-3.5" aria-hidden="true" />
                    <span>
                      <span className="block font-medium text-foreground">{session.title}</span>
                      <span>{session.messageCount} 条记录 · {session.updatedLabel}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>

      <aside className="order-3 border-t bg-card/82 p-4 lg:order-3 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="本次会话布鲁姆状态">
        <div className="space-y-4 pb-3">
          <section className="rounded-lg border border-primary/20 bg-primary/6 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-lg">本次会话</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">会话会形成布鲁姆认知路径；项目层级必须由挑战确认。</p>
              </div>
              <Route className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-4 space-y-3">
              {activeProject ? (
                <div className="rounded-md border border-border/65 bg-background/72 p-3">
                  <p className="text-xs text-muted-foreground">当前项目</p>
                  <p className="mt-1 font-heading text-base">《{activeProject.title}》</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{activeProject.questionCount} 个问题 · {activeProject.sessions.length} 条会话</p>
                </div>
              ) : (
                <div className="rounded-md border border-dashed bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
                  还没有强绑定项目。问题明确出现篇目后，系统会轻提示归入结果。
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border/65 bg-background/72 p-3">
                  <p className="text-muted-foreground">已确认</p>
                  <div className="mt-2">{confirmedLevel ? <BloomBadge level={confirmedLevel} /> : <Badge variant="outline">等待挑战确认</Badge>}</div>
                </div>
                <div className="rounded-md border border-border/65 bg-background/72 p-3">
                  <p className="text-muted-foreground">下一挑战</p>
                  <div className="mt-2"><BloomBadge level={nextLevel} /></div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border/65 bg-background/72 p-4 shadow-soft">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-base">布鲁姆认知路径</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">只记录本次会话的学生问题，不把 AI 回答或教师修订当作判断依据。</p>
              </div>
              <Badge variant="secondary">{sessionStatusItems.length}</Badge>
            </div>
            {sessionStatusItems.length === 0 ? (
              <div className="rounded-md border border-dashed bg-card/70 px-3 py-4 text-xs leading-5 text-muted-foreground">
                发送问题后，这里显示“等待布鲁姆分类”；分类失败时不会伪造层级。
              </div>
            ) : (
              <div className="space-y-2">
                {sessionStatusItems.map(([messageId, item], index) => (
                  <div key={messageId} className="rounded-md border border-border/65 bg-card/78 p-3 text-xs shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">问题 {index + 1}</span>
                      {item.state === 'classified' ? <BloomBadge level={item.level} /> : item.state === 'pending' ? <Badge variant="outline">等待分类</Badge> : item.state === 'failed' ? <Badge variant="destructive">分类失败</Badge> : <Badge variant="secondary">未分类</Badge>}
                    </div>
                    <p className="mt-2 leading-5 text-muted-foreground">
                      {item.state === 'classified'
                        ? bloomLevelInfo[item.level].hint
                        : item.state === 'failed'
                          ? item.reason ?? '分类失败，保留消息但不进入认知路径。'
                          : '正在等待真实分类结果。'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-accent/25 bg-accent/8 p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <Swords className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div className="space-y-2">
                <p className="font-heading text-base">挑战确认项目层级</p>
                <p className="text-xs leading-5 text-muted-foreground">挑战负责确认项目层级。会话路径只能提示你怎么追问，不能直接提高看板主统计。</p>
                <Button
                  nativeButton={false}
                  render={<a href={activeProject ? `/student/challenge/${activeProject.id}` : '/student/challenge'}>进入挑战确认</a>}
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                />
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
