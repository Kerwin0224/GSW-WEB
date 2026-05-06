'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Link from 'next/link';
import { Braces, Loader2, Plus } from 'lucide-react';

import type { Database } from '@/lib/supabase/database.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { saveTeacherPromptPreset, type AuditSubmissionState } from '@/lib/data/teacher-actions';

const teacherPrompts = ['这首诗的课堂导入怎么设计？', '学生容易误解哪个典故？', '设计三个分层追问', '把这段文言文讲得更清楚'];

type Preset = Database['public']['Tables']['prompt_presets']['Row'];
const instructionInitialState: AuditSubmissionState = { ok: false, message: '' };
const presetVariables = ['学生姓名', '当前篇目', '年级', '课堂目标', '常见误区', '挑战层级'];
const placeholderPattern = /\{\{\s*([a-zA-Z0-9_\u4e00-\u9fff-]+)\s*\}\}/g;
const unsupportedTemplatePattern = /\{\{\s*(?:[#/^>!&]|\{)|\}\}\}/;

function presetVariableLabels(variables: Preset['variables']) {
  if (!Array.isArray(variables)) return '见预设 JSON';
  const labels = variables
    .map((variable) => {
      if (typeof variable === 'string') return variable;
      if (variable && typeof variable === 'object' && !Array.isArray(variable)) {
        const name = variable.name;
        return typeof name === 'string' ? name : null;
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
  return labels.length > 0 ? labels.join('、') : '未定义变量';
}

export function TeacherChatClient({ presets, providerBlocked }: { presets: Preset[]; providerBlocked?: string }) {
  const [input, setInput] = useState('');
  const [presetId, setPresetId] = useState<string>(presets[0]?.id ?? '');
  const [conversationId, setConversationId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/teacher/chat',
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        const nextConversationId = response.headers.get('x-conversation-id');
        if (nextConversationId) setConversationId(nextConversationId);
        return response;
      },
    }),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const selectedPreset = presets.find((preset) => preset.id === presetId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const uploadAttachment = async (file: File) => {
    if (uploading || !selectedPreset || providerBlocked) return;
    setUploading(true);
    setUploadStatus('');
    setUploadError('');
    const form = new FormData();
    form.set('file', file);
    form.set('metadata', JSON.stringify({
      workspace: 'teacher',
      conversationId: conversationId || undefined,
      presetId: selectedPreset.id,
    }));
    try {
      const response = await fetch('/api/attachments', { method: 'POST', body: form });
      const payload = await response.json() as { ok?: boolean; message?: string; conversationId?: string; fileName?: string; chunkCount?: number };
      if (!response.ok || !payload.ok) throw new Error(payload.message || '附件上传失败。');
      if (payload.conversationId) setConversationId(payload.conversationId);
      setUploadStatus(`已上传《${payload.fileName ?? file.name}》，生成 ${payload.chunkCount ?? 0} 段仅限当前会话检索的附件片段。`);
    } catch (uploadError) {
      setUploadError(uploadError instanceof Error ? uploadError.message : '附件上传失败。');
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const text = input.trim();
    if (!text || busy || !selectedPreset || providerBlocked) return;
    sendMessage({ parts: [{ type: 'text', text }] }, { body: { presetId: selectedPreset.id, ...(conversationId ? { conversationId } : {}) } });
    setInput('');
  };

  return (
    <div className="grid min-h-[42rem] bg-background/40 lg:grid-cols-[22rem_1fr]">
      <aside className="border-b bg-card/90 p-4 lg:border-b-0 lg:border-r">
        <div className="space-y-4 lg:sticky lg:top-16">
          <Card>
            <CardHeader>
              <CardTitle>教学预设</CardTitle>
              <CardDescription>教师使用真实预设，也可以沉淀自己的草稿。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {presets.length === 0 ? (
                <BlockedState title="暂无已发布预设" description="请管理员先发布教学 Prompt；这里不会提供通用模拟预设。" />
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="preset">选择预设</Label>
                <Select value={presetId} onValueChange={(value) => setPresetId(value ?? '')} disabled={presets.length === 0}>
                  <SelectTrigger id="preset">
                    <SelectValue placeholder="选择已发布预设" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.title} v{preset.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button nativeButton={false} render={<Link href="/teacher/instructions"><Plus />新建教师预设</Link>} variant="outline" className="w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>预设说明</CardTitle>
              <CardDescription>发给模型前先确认教学目标。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {selectedPreset ? (
                <dl className="grid gap-2">
                  <dt className="font-medium text-foreground">场景</dt>
                  <dd>{selectedPreset.scenario}</dd>
                  <dt className="font-medium text-foreground">版本</dt>
                  <dd>v{selectedPreset.version}</dd>
                  <dt className="font-medium text-foreground">变量</dt>
                  <dd>{presetVariableLabels(selectedPreset.variables)}</dd>
                </dl>
              ) : (
                '尚未选择真实发布预设。'
              )}
            </CardContent>
          </Card>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {providerBlocked ? <BlockedState title="教师 AI 能力未就绪" description={providerBlocked} /> : null}
            {messages.length === 0 ? (
              <EmptyState
                title="选择预设，开始设计一节可上好的课"
                description="围绕篇目、年级、学生误区或挑战目标提问；输出会进入可核实闭环。"
                action={(
                  <div className="flex flex-wrap justify-center gap-2">
                    {teacherPrompts.map((prompt) => (
                      <button key={prompt} type="button" className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setInput(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              />
            ) : (
              <AIMessageList messages={messages} />
            )}
            {busy ? (
              <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                AI 正在生成教学支持…
              </div>
            ) : null}
            {error ? <ErrorState title="教学 AI 响应失败" description={error.message} /> : null}
          </div>
        </div>
        <div className="border-t bg-card/95 p-4">
          <div className="mx-auto max-w-3xl">
            <ChatComposer
              value={input}
              onChange={setInput}
              onSubmit={submit}
              placeholder="输入教学问题…"
              disabled={busy || !selectedPreset || Boolean(providerBlocked)}
              blockedReason={providerBlocked || (!selectedPreset ? '缺少已发布 Prompt 预设。' : undefined)}
              onFileUpload={uploadAttachment}
              uploadDisabled={busy || uploading || !selectedPreset || Boolean(providerBlocked)}
              uploadStatus={uploadStatus}
              uploadError={uploadError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function extractPlaceholders(...templates: string[]) {
  return [...new Set(templates.flatMap((template) => [...template.matchAll(placeholderPattern)].map((match) => match[1].trim())))];
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(placeholderPattern, (_, key: string) => values[key] || `{{${key}}}`);
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null;
}

export function TeacherInstructionEditor({ presets }: { presets: Preset[] }) {
  const [state, action, pending] = useActionState(saveTeacherPromptPreset, instructionInitialState);
  const [title, setTitle] = useState('七年级古诗文追问预设');
  const [scenario, setScenario] = useState('课堂备课');
  const [systemInstruction, setSystemInstruction] = useState('你是一名古诗文教师助手。围绕{{当前篇目}}，帮助老师为{{学生姓名}}设计从理解到分析的追问。');
  const [userTemplate, setUserTemplate] = useState('请基于{{课堂目标}}，生成 3 个分层问题，并指出{{常见误区}}的处理方式。');
  const detectedVariables = extractPlaceholders(systemInstruction, userTemplate);
  const unsupportedTemplate = unsupportedTemplatePattern.test(systemInstruction) || unsupportedTemplatePattern.test(userTemplate);
  const [variableSamples, setVariableSamples] = useState<Record<string, string>>({
    学生姓名: '沈明',
    当前篇目: '《登鹳雀楼》',
    年级: '七年级',
    课堂目标: '理解景物描写与志向表达',
    常见误区: '只翻译字面，不解释“更上一层楼”的表达效果',
    挑战层级: 'L3-L4',
  });
  const missingSamples = detectedVariables.filter((name) => !variableSamples[name]?.trim());
  const previewBlocked = unsupportedTemplate || missingSamples.length > 0;
  const values = Object.fromEntries(detectedVariables.map((name) => [name, variableSamples[name] ?? '']));

  const insertVariable = (name: string) => {
    setSystemInstruction((current) => `${current}${current.endsWith(' ') || current.length === 0 ? '' : ' '}{{${name}}}`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="教师预设"
        title="把好用的教学问法沉淀下来。"
        description="教师可以自建草稿预设，使用 literal {{variable}} 变量语法；右侧预览只做 mock 渲染，不伪造真实 AI 回复。"
        primaryAction={{ label: '回到教师问答', href: '/teacher#teacher-chat' }}
        metrics={[
          { label: '我的草稿/预设', value: presets.length, hint: 'created_by 当前教师' },
          { label: '变量语法', value: '{{var}}', hint: 'literal placeholder subset' },
          { label: '预览方式', value: 'mock', hint: '只验证插值与结构' },
        ]}
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">预设编辑器</CardTitle>
            <CardDescription>保存为 draft，不绕过管理员发布流程。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={action} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preset-title">预设名称</Label>
                  <Input id="preset-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} />
                  <FieldError message={state.errors?.title} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preset-scenario">课堂场景</Label>
                  <Input id="preset-scenario" name="scenario" value={scenario} onChange={(event) => setScenario(event.target.value)} />
                  <FieldError message={state.errors?.scenario} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="system-instruction">教师问答指引</Label>
                  <div className="flex flex-wrap gap-1">
                    {presetVariables.map((variable) => (
                      <Button key={variable} type="button" variant="outline" size="xs" onClick={() => insertVariable(variable)}>
                        <Braces />{variable}
                      </Button>
                    ))}
                  </div>
                </div>
                <Textarea id="system-instruction" name="system_instruction" value={systemInstruction} onChange={(event) => setSystemInstruction(event.target.value)} className="min-h-48 font-mono text-sm" />
                <FieldError message={state.errors?.system_instruction} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-template">User Template</Label>
                <Textarea id="user-template" name="user_template" value={userTemplate} onChange={(event) => setUserTemplate(event.target.value)} className="min-h-28 font-mono text-sm" />
              </div>

              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-medium">变量定义与样例</p>
                  <p className="text-xs text-muted-foreground">占位符必须有显式定义和样例，保存与预览都会检查。</p>
                </div>
                {detectedVariables.length === 0 ? (
                  <EmptyState title="尚未检测到变量" description="在 System Instruction 或 User Template 中输入 {{学生姓名}} 这类 literal 占位符。" />
                ) : detectedVariables.map((name) => (
                  <div key={name} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                    <input type="hidden" name="variable_name" value={name} />
                    <Label htmlFor={`variable-${name}`} className="pt-2">{name}</Label>
                    <Input
                      id={`variable-${name}`}
                      name="variable_sample"
                      value={variableSamples[name] ?? ''}
                      onChange={(event) => setVariableSamples((current) => ({ ...current, [name]: event.target.value }))}
                      placeholder={`${name}样例`}
                    />
                  </div>
                ))}
                <FieldError message={state.errors?.variables} />
                <FieldError message={state.errors?.variable_sample} />
              </div>

              {state.message ? (
                <p className={state.ok ? 'rounded-lg border border-primary/30 bg-primary/10 p-2 text-sm text-primary' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'} role={state.ok ? 'status' : 'alert'}>
                  {state.message}
                </p>
              ) : null}
              <Button disabled={pending || previewBlocked}>保存为草稿</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">问法预览</CardTitle>
              <CardDescription>预览变量替换后的教师问答指引与提问模板。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {previewBlocked ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive" role="alert">
                  {unsupportedTemplate ? '模板包含不支持的 Handlebars helper/block/triple-stash 语法。' : `请先填写变量样例：${missingSamples.join('、')}。`}
                </div>
              ) : (
                <>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <Badge variant="outline" className="mb-2">system</Badge>
                    <p className="whitespace-pre-wrap leading-7">{renderTemplate(systemInstruction, values)}</p>
                  </div>
                  <div className="rounded-lg border bg-primary/5 p-3">
                    <Badge variant="outline" className="mb-2">teacher</Badge>
                    <p className="whitespace-pre-wrap leading-7">{renderTemplate(userTemplate, values)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading">我的预设</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {presets.length === 0 ? (
                <EmptyState title="暂无教师自建预设" description="保存草稿后会出现在这里；发布仍由管理员治理。" />
              ) : presets.map((preset) => (
                <div key={preset.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{preset.title}</p>
                    <Badge variant="outline">{preset.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{preset.scenario} · v{preset.version}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="变量规则" description="这里只支持 literal {{variable}} 占位符，不执行模板 helper 或表达式，避免把教师问答预设变成第二套业务逻辑。" />
      </section>
    </div>
  );
}
