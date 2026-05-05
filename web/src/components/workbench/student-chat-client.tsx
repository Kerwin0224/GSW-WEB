'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { BookOpen, ChevronDown, Loader2, MessageSquare, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import type { BloomStatus } from '@/components/workbench/bloom-status-badge';
import type { ProjectSummary } from '@/lib/data/student';
import { cn } from '@/lib/utils';

const promptChips = ['《静夜思》的“疑”是什么意思？', '这句怎么翻译？', '诗人为什么这样写？', '帮我从分析层级继续追问'];

export function StudentChatClient({
  providerBlocked,
  classificationBlocked,
  projects,
}: {
  providerBlocked?: string;
  classificationBlocked?: string;
  projects: ProjectSummary[];
}) {
  const [input, setInput] = useState('');
  const [activeProjectId, setActiveProjectId] = useState('');
  const [assignedProjectTitle, setAssignedProjectTitle] = useState('待自动归属');
  const [expandedProjectId, setExpandedProjectId] = useState('');
  const [bloomStatus, setBloomStatus] = useState<Record<string, BloomStatus>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/student/chat' }),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const activeProject = useMemo(() => projects.find((project) => project.id === activeProjectId), [activeProjectId, projects]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || providerBlocked || classificationBlocked) return;

    sendMessage({ parts: [{ type: 'text', text }] }, { body: activeProjectId ? { projectId: activeProjectId, projectTitle: activeProject?.title } : {} });
    setAssignedProjectTitle(activeProject?.title ?? '自动识别中的篇目');
    if (activeProjectId) setExpandedProjectId(activeProjectId);
    setBloomStatus((current) => ({ ...current, pending: { state: 'pending' } }));
    setInput('');
  };

  const blocked = providerBlocked || classificationBlocked;

  return (
    <div className="grid min-h-[42rem] bg-background/40 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="border-b bg-card/80 p-4 lg:border-b-0 lg:border-r" aria-label="篇目项目和会话">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-heading text-lg">篇目项目</p>
            <p className="mt-1 text-xs text-muted-foreground">项目为第一层，会话沉淀在篇目下。</p>
          </div>
          <Badge variant="outline">{projects.length}</Badge>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            title="先自然提问"
            description="系统会用真实分类能力把会话归入篇目；缺少分类能力时会显示阻塞原因。"
            className="bg-background/60"
          />
        ) : (
          <div className="space-y-3">
            {projects.map((project) => {
              const active = project.id === activeProjectId;
              const expanded = project.id === expandedProjectId;
              return (
                <div key={project.id} className={cn('rounded-xl border bg-background/70', active && 'border-primary/60 bg-primary/5')}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveProjectId(project.id);
                      setAssignedProjectTitle(project.title);
                      setExpandedProjectId(expanded ? '' : project.id);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
                  >
                    <span>
                      <span className="block font-heading">《{project.title}》</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{project.questionCount} 问题 · 挑战 {project.challengeProgress.achievedCount}/{project.challengeProgress.attemptedCount}</span>
                    </span>
                    <ChevronDown className={cn('size-4 text-muted-foreground transition', expanded && 'rotate-180')} aria-hidden="true" />
                  </button>
                  {expanded ? (
                    <div className="space-y-1 border-t px-3 py-2">
                      {project.sessions.length === 0 ? <p className="text-xs text-muted-foreground">暂无会话，继续提问后会自动出现。</p> : null}
                      {project.sessions.map((session) => (
                        <a key={session.id} href={`/student/projects/${project.id}`} className="flex items-start gap-2 rounded-lg px-2 py-2 text-xs hover:bg-muted">
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
      </aside>

      <section className="flex min-w-0 flex-col" aria-label="古诗文学习对话">
        <div className="border-b bg-card/90 px-4 py-3">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">当前项目层级</p>
              <p className="font-heading text-xl">{activeProject ? `《${activeProject.title}》` : '自然提问，系统自动归属篇目'}</p>
            </div>
            <Badge className="w-fit" variant="outline"><Sparkles className="mr-1 size-3" />已进入项目化学习</Badge>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {providerBlocked ? <BlockedState title="学生 AI 能力未就绪" description={providerBlocked} /> : null}
            {classificationBlocked ? <BlockedState title="分类能力未就绪" description={classificationBlocked} /> : null}
            {messages.length === 0 ? (
              <EmptyState
                title="把卡住的句子直接问出来"
                description="不用先填表。系统会把真实对话归入篇目项目，并在回答区轻提示归属结果。"
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
            {messages.length > 0 ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm" aria-live="polite">
                <BookOpen className="mr-2 inline size-4 text-primary" aria-hidden="true" />
                已归入《{assignedProjectTitle}》项目。你可以继续追问，不会被强制跳转。
              </div>
            ) : null}
            {busy ? (
              <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="size-4 animate-spin" />
                {status === 'submitted' ? '已提交，等待模型首个响应…' : 'AI 正在流式回答…'}
              </div>
            ) : null}
            {error ? <ErrorState title="AI 响应失败" description={error.message} /> : null}
          </div>
        </div>
        <div className="border-t bg-card/95 p-4">
          <div className="mx-auto max-w-3xl">
            <ChatComposer
              value={input}
              onChange={setInput}
              onSubmit={submit}
              placeholder="直接输入你的古诗文问题…（Enter 发送，Shift+Enter 换行）"
              disabled={busy || Boolean(blocked)}
              blockedReason={blocked}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
