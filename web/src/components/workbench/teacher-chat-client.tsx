'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Loader2 } from 'lucide-react';

import type { Database } from '@/lib/supabase/database.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';

const teacherPrompts = ['这首诗的课堂导入怎么设计？', '学生容易误解哪个典故？', '设计三个分层追问', '把这段文言文讲得更清楚'];

type Preset = Database['public']['Tables']['prompt_presets']['Row'];

export function TeacherChatClient({ presets, providerBlocked }: { presets: Preset[]; providerBlocked?: string }) {
  const [input, setInput] = useState('');
  const [presetId, setPresetId] = useState<string>(presets[0]?.id ?? '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/teacher/chat' }),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const selectedPreset = presets.find((preset) => preset.id === presetId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || !selectedPreset || providerBlocked) return;
    sendMessage({ parts: [{ type: 'text', text }] }, { body: { presetId: selectedPreset.id } });
    setInput('');
  };

  return (
    <div className="grid min-h-[42rem] bg-background/40 lg:grid-cols-[22rem_1fr]">
      <aside className="border-b bg-card/90 p-4 lg:border-b-0 lg:border-r">
        <div className="space-y-4 lg:sticky lg:top-16">
          <Card>
            <CardHeader>
              <CardTitle>教学预设</CardTitle>
              <CardDescription>教师只使用学校发布的真实预设。</CardDescription>
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
                  <dd>{Array.isArray(selectedPreset.variables) ? selectedPreset.variables.join('、') : '见预设 JSON'}</dd>
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
                description="围绕篇目、年级、学生误区或练习目标提问；输出会进入可审计链路。"
                action={(
                  <div className="flex flex-wrap justify-center gap-2">
                    {teacherPrompts.map((prompt) => (
                      <button key={prompt} type="button" className="rounded-full border px-3 py-1 text-sm hover:bg-muted" onClick={() => setInput(prompt)}>
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
              <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
