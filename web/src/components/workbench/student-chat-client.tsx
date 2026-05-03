'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import type { BloomStatus } from '@/components/workbench/bloom-status-badge';

const promptChips = ['这句怎么翻译？', '诗人为什么这样写？', '这首诗表达了什么情感？', '帮我设计一道理解题'];

export function StudentChatClient({
  providerBlocked,
  classificationBlocked,
}: {
  providerBlocked?: string;
  classificationBlocked?: string;
}) {
  const [input, setInput] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [bloomStatus, setBloomStatus] = useState<Record<string, BloomStatus>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/student/chat' }),
  });
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || providerBlocked || classificationBlocked || !projectTitle.trim()) return;

    sendMessage({ parts: [{ type: 'text', text }] }, { body: { projectTitle: projectTitle.trim() } });
    setBloomStatus((current) => ({ ...current, pending: { state: 'pending' } }));
    setInput('');
  };

  const blocked = providerBlocked || classificationBlocked || (!projectTitle.trim() ? '先填写真实篇目标题；没有篇目就不创建学习记录。' : undefined);

  return (
    <div className="flex min-h-[42rem] flex-col bg-background/40">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {providerBlocked ? <BlockedState title="学生 AI 能力未就绪" description={providerBlocked} /> : null}
          {classificationBlocked ? <BlockedState title="分类能力未就绪" description={classificationBlocked} /> : null}
          {messages.length === 0 ? (
            <EmptyState
              title="今天读哪一篇？卡在哪里？"
              description="先写篇目，再写问题。平台要帮你把古诗文读懂，而不是堆功能。"
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
        <div className="mx-auto max-w-3xl space-y-3">
          <Input
            value={projectTitle}
            onChange={(event) => setProjectTitle(event.target.value)}
            placeholder="篇目标题，如：静夜思 / 岳阳楼记"
            aria-label="篇目标题"
            disabled={busy}
          />
          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={submit}
            placeholder="输入你的古诗文问题…（Enter 发送，Shift+Enter 换行）"
            disabled={busy || Boolean(blocked)}
            blockedReason={blocked}
          />
        </div>
      </div>
    </div>
  );
}
