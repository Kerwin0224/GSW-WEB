'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRouter } from 'next/navigation';
import { ClipboardList, Loader2, Plus, Sparkles } from 'lucide-react';

import type { Database } from '@/lib/supabase/database.types';
import type { TeacherConversationInitial, TeacherSessionSummary } from '@/lib/data/teacher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { ChatWorkspace } from '@/components/workbench/chat-workspace';
import { ThinkingIndicator } from '@/components/workbench/thinking-indicator';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SessionRow } from '@/components/workbench/session-row';
import { saveTeacherPromptPreset, type AuditSubmissionState } from '@/lib/data/teacher-actions';
import { cn } from '@/lib/utils';

const teacherPrompts = ['这节课的课堂导入怎么设计？', '学生容易混淆哪个概念？', '设计三个分层追问', '把这段内容讲得更清楚'];

type Preset = Database['public']['Tables']['prompt_presets']['Row'];
const instructionInitialState: AuditSubmissionState = { ok: false, message: '' };

function presetText(preset: Preset) {
  return [preset.system_instruction, preset.user_template].filter(Boolean).join('\n\n');
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null;
}

function CreatePresetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveTeacherPromptPreset, instructionInitialState);

  useEffect(() => {
    if (!state.ok) return;
    onOpenChange(false);
    router.refresh();
  }, [onOpenChange, router, state.ok]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新建教学模板</DialogTitle>
          <DialogDescription>保存常用问法或教学要求，之后可直接填入备课问答。</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-preset-title">模板名称</Label>
            <Input id="quick-preset-title" name="title" placeholder="例如：课堂追问设计" />
            <FieldError message={state.errors?.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quick-preset-content">模板内容</Label>
            <Textarea id="quick-preset-content" name="system_instruction" className="min-h-44" placeholder="写下希望填入输入框的常用问法或教学处理要求。" />
            <FieldError message={state.errors?.system_instruction} />
          </div>
           <input type="hidden" name="scenario" value="备课问答" />
          {state.message ? (
            <p className={state.ok ? 'rounded-lg border border-primary/30 bg-primary/10 p-2 text-sm text-primary' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'} role={state.ok ? 'status' : 'alert'}>
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button disabled={pending} className="cursor-pointer shadow-ink">保存模板</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PresetConflictDialog({ preset, onCancel, onReplace, onAppend }: { preset: Preset | null; onCancel: () => void; onReplace: () => void; onAppend: () => void }) {
  return (
    <Dialog open={Boolean(preset)} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>如何使用这个模板？</DialogTitle>
          <DialogDescription>当前输入框已有内容，可以替换、追加，或取消本次填入。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
          <Button type="button" variant="secondary" onClick={onAppend}>追加到当前输入</Button>
          <Button type="button" onClick={onReplace}>替换当前输入</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherChatClient({
  presets,
  sessions: initialSessions,
  initialConversation,
  providerBlocked,
}: {
  presets: Preset[];
  sessions: TeacherSessionSummary[];
  initialConversation?: TeacherConversationInitial;
  providerBlocked?: string;
}) {
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState(initialConversation?.id ?? '');
  const [sessions, setSessions] = useState(initialSessions);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [createPresetOpen, setCreatePresetOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherSessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [lastSubmittedInput, setLastSubmittedInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, setMessages, sendMessage, clearError, status, error } = useChat({
    messages: initialConversation?.messages,
    transport: new DefaultChatTransport({
      api: '/api/teacher/chat',
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        const nextConversationId = response.headers.get('x-conversation-id');
        if (nextConversationId) {
          setConversationId(nextConversationId);
          setSessions((current) => {
            const existing = current.find((session) => session.id === nextConversationId);
            const fallbackTitle = (lastSubmittedInput || '未命名会话').slice(0, 80);
            const nextSession = existing
              ? { ...existing, updatedLabel: '刚刚', messageCount: Math.max(existing.messageCount + 2, 2) }
              : { id: nextConversationId, title: fallbackTitle, messageCount: 2, updatedLabel: '刚刚' };
            return [nextSession, ...current.filter((session) => session.id !== nextConversationId)].slice(0, 12);
          });
        }
        return response;
      },
    }),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const recentPresets = useMemo(() => presets.slice(0, 5), [presets]);
  const currentSession = sessions.find((session) => session.id === conversationId);
  const currentSessionTitle = conversationId ? currentSession?.title ?? initialConversation?.title ?? '当前会话' : '新会话';

  useEffect(() => {
    if (messages.length === 0) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const nextUrl = conversationId ? `/teacher/chat?conversationId=${conversationId}` : '/teacher/chat';
    window.history.replaceState(null, '', nextUrl);
  }, [conversationId]);

  const applyPreset = (preset: Preset) => {
    if (input.trim()) {
      setPendingPreset(preset);
      return;
    }
    setInput(presetText(preset));
  };

  const replaceWithPendingPreset = () => {
    if (!pendingPreset) return;
    setInput(presetText(pendingPreset));
    setPendingPreset(null);
  };

  const appendPendingPreset = () => {
    if (!pendingPreset) return;
    setInput((current) => `${current.trimEnd()}\n\n${presetText(pendingPreset)}`.trim());
    setPendingPreset(null);
  };

  const openNewConversation = () => {
    if (busy) return;
    setConversationId('');
    setInput('');
    setUploadStatus('');
    setUploadError('');
    setPendingPreset(null);
    clearError();
    setMessages([]);
  };

  const uploadAttachment = async (file: File) => {
    if (uploading || providerBlocked) return;
    setUploading(true);
    setUploadStatus('');
    setUploadError('');
    const form = new FormData();
    form.set('file', file);
    form.set('metadata', JSON.stringify({
      workspace: 'teacher',
      conversationId: conversationId || undefined,
    }));
    try {
      const response = await fetch('/api/attachments', { method: 'POST', body: form });
      const payload = await response.json() as { ok?: boolean; message?: string; conversationId?: string; fileName?: string; chunkCount?: number };
      if (!response.ok || !payload.ok) throw new Error(payload.message || '附件上传失败。');
      if (payload.conversationId) {
        const nextConversationId = payload.conversationId;
        setConversationId(nextConversationId);
        setSessions((current) => {
          const existing = current.find((session) => session.id === nextConversationId);
          const title = existing?.title ?? (payload.fileName ?? file.name).slice(0, 80);
          const nextSession = existing
            ? { ...existing, updatedLabel: '刚刚' }
            : { id: nextConversationId, title, messageCount: 0, updatedLabel: '刚刚' };
          return [nextSession, ...current.filter((session) => session.id !== nextConversationId)].slice(0, 12);
        });
      }
      setUploadStatus(`${payload.fileName ?? file.name} 已上传，可用于当前会话`);
    } catch (uploadError) {
      setUploadError(uploadError instanceof Error ? uploadError.message : '附件上传失败。');
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const text = input.trim();
    if (!text || busy || providerBlocked) return;
    clearError();
    setLastSubmittedInput(text);
    sendMessage({ parts: [{ type: 'text', text }] }, { body: { ...(conversationId ? { conversationId } : {}) } });
    setInput('');
  };

  const confirmDeleteSession = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch('/api/teacher/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: deleteTarget.id }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? '会话删除失败。');
      setSessions((current) => current.filter((session) => session.id !== deleteTarget.id));
      if (conversationId === deleteTarget.id) openNewConversation();
      setDeleteTarget(null);
    } catch (deleteError) {
      setDeleteError(deleteError instanceof Error ? deleteError.message : '会话删除失败。');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <CreatePresetDialog open={createPresetOpen} onOpenChange={setCreatePresetOpen} />
      <PresetConflictDialog preset={pendingPreset} onCancel={() => setPendingPreset(null)} onReplace={replaceWithPendingPreset} onAppend={appendPendingPreset} />
      <ChatWorkspace
        storageKey="teacher-chat-sidebar-collapsed"
        sidebarLabel="备课问答"
        sidebar={(<>
          <section className="rounded-2xl border border-primary/18 bg-background/72 p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">会话管理</p>
                <h2 className="mt-2 font-heading text-xl tracking-tight">备课问答</h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">切换历史会话，继续准备课堂内容。</p>
              </div>
              <Button type="button" size="sm" onClick={openNewConversation} disabled={busy} className="min-h-10 cursor-pointer rounded-xl shadow-ink">
                <Plus className="size-4" />新会话
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border/65 bg-card/86 p-3 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
              <div>
                <p className="font-heading text-lg">历史会话</p>
                <p className="mt-1 text-xs text-muted-foreground">支持续问、回看与删除。</p>
              </div>
              <Badge variant="outline">{sessions.length}</Badge>
            </div>
            <button
              type="button"
              onClick={openNewConversation}
              disabled={busy}
              className={cn('mb-2 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-left text-xs transition-[border-color,background-color,color] duration-200 hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !conversationId && 'border-primary/45 bg-primary/7 text-primary')}
            >
              <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
              从空白输入开始一个新会话
            </button>
            {sessions.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-background/50 px-3 py-4 text-xs text-muted-foreground">暂无历史会话。</div>
            ) : (
              <div className="space-y-1 rounded-xl border bg-background/60 p-2">
                {sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    current={session.id === conversationId}
                    href={`/teacher/chat?conversationId=${session.id}`}
                    onDelete={() => { setDeleteTarget(session); setDeleteError(''); }}
                  />
                ))}
              </div>
            )}
          </section>

          <Card flushHeader className="overflow-hidden rounded-2xl border-primary/20 bg-card/92 shadow-soft">
            <CardHeader className="border-b border-border/60 bg-primary/6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <ClipboardList className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle className="font-heading">教学模板</CardTitle>
                  <CardDescription>点击模板只填入输入框，不会自动发送。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 py-4">
              {recentPresets.length === 0 ? (
                <BlockedState title="暂无可用提示词模板" description="可以先直接提问；需要复用固定问法时，点击下方按钮创建模板。" />
              ) : (
                <div className="grid gap-2">
                  {recentPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="cursor-pointer rounded-xl border border-border/65 bg-background/78 p-3 text-left shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/6 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{preset.title}</span>
                        <Badge variant="outline" className="bg-card/80">填入</Badge>
                      </span>
                      <span className="mt-2 line-clamp-2 block text-xs leading-5 text-muted-foreground">{preset.system_instruction}</span>
                    </button>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" onClick={() => setCreatePresetOpen(true)} className="min-h-11 w-full cursor-pointer rounded-xl bg-background/78 transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/5 hover:shadow-soft">
                <Plus className="size-4" />新建教学模板
              </Button>
            </CardContent>
          </Card>
        </>)}
        header={(
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">当前会话</p>
                <p className="font-heading text-2xl tracking-tight">{currentSessionTitle}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {conversationId ? '继续围绕当前问题链追问、上传附件或套用模板。' : '从空白输入开始，不打断备课问答节奏。'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="w-fit border-primary/25 bg-primary/8 text-primary" variant="outline">{conversationId ? '继续会话' : '新会话'}</Badge>
                <Badge className="w-fit" variant="secondary">{uploadStatus ? '已含附件' : '可传附件'}</Badge>
              </div>
            </div>
        )}
        messages={(
          <>
            {messages.length === 0 ? (
              <EmptyState
                title="开始新的备课问答"
                description="围绕学习内容、课堂目标、学生误区或追问设计直接提问；需要时再补模板或附件。"
                action={(
                  <div className="flex flex-wrap justify-center gap-2">
                    {teacherPrompts.map((prompt) => (
                      <button key={prompt} type="button" className="min-h-11 cursor-pointer rounded-full border border-primary/20 bg-card/86 px-4 py-2 text-sm shadow-soft transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/40 hover:bg-primary/6 hover:shadow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setInput(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              />
            ) : (
              <AIMessageList messages={messages} assistantCardClassName="max-h-[28rem] overflow-y-auto overscroll-contain pr-2" />
            )}
            {status === 'submitted' ? (
              // 等待首字只显示呼吸圆点，流式期间不叠状态卡片（与学生端共用同一组件）。
              <ThinkingIndicator />
            ) : null}
            {error ? <ErrorState title="备课问答响应失败" description={error.message} /> : null}
          </>
        )}
        footer={(

          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={submit}
            placeholder="输入教学问题…（Enter 发送，Shift+Enter 换行）"
            disabled={busy || uploading || Boolean(providerBlocked)}
            inputDisabled={busy || uploading}
            blockedReason={providerBlocked}
            onFileUpload={uploadAttachment}
            uploadDisabled={busy || uploading || Boolean(providerBlocked)}
            uploadStatus={uploadStatus}
            uploadError={uploadError}
          />
        )}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
             <DialogTitle>删除备课会话</DialogTitle>
             <DialogDescription>删除后，这条备课问答会话会从侧栏移除，相关附件也不再用于这条会话。</DialogDescription>
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
    </>
  );
}
