'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';
import type { BloomStatus } from '@/components/workbench/bloom-status-badge';

const promptChips = ['解释诗句', '比较手法', '生成练习', '仿写引导'];
const workspaceState = {
  loadingProfile: false,
  permissionDenied: false,
  providerBlocked: false,
  projectClassificationCommitted: false,
};

export default function StudentChatPage() {
  const [input, setInput] = useState('');
  const [bloomStatus, setBloomStatus] = useState<Record<string, BloomStatus>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({ transport: new DefaultChatTransport({ api: '/api/student/chat' }) });
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || workspaceState.providerBlocked) return;
    sendMessage({ parts: [{ type: 'text', text }] });
    setBloomStatus((current) => ({ ...current, pending: { state: 'pending' } }));
    setInput('');
  };

  if (workspaceState.loadingProfile) return <LoadingSurface label="正在加载学习提问工作台" className="m-6" />;
  if (workspaceState.permissionDenied) {
    return <div className="p-6"><PermissionState title="无法访问学生工作台" description="当前账号没有学生角色或班级范围。请联系管理员校正账号资料。" /></div>;
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {workspaceState.providerBlocked ? <BlockedState title="学生 AI 能力未就绪" description="缺少 student_chat / bloom_classification / project_classification 真实模型能力配置。管理员配置前不会生成模拟回答或假分类。" /> : null}
          {messages.length === 0 ? (
            <EmptyState
              title="今天想读哪首诗 / 哪篇文言文？"
              description="提出问题后，系统会在真实 AI 与分类能力可用时归入篇目项目，并显示布鲁姆分类状态。"
              action={<div className="flex flex-wrap justify-center gap-2">{promptChips.map((chip) => <Button key={chip} variant="outline" size="sm" onClick={() => setInput(chip)}>{chip}</Button>)}</div>}
            />
          ) : <AIMessageList messages={messages} userBloomStatus={bloomStatus} />}

          {busy ? (
            <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {status === 'submitted' ? '已提交，等待模型首个响应…' : 'AI 正在流式回答…'}
            </div>
          ) : null}

          {workspaceState.projectClassificationCommitted ? <SuccessState title="篇目归档已确认" description="真实项目分类完成后，问题会归入对应篇目并更新认知路径。" /> : null}
          {error ? <ErrorState title="AI 响应失败" description={error.message} action={<Button variant="outline" size="sm" onClick={() => submit()}>重试当前输入</Button>} /> : null}
        </div>
      </div>

      <div className="border-t bg-background/95 p-4">
        <div className="mx-auto max-w-3xl space-y-2">
          <p className="text-xs text-muted-foreground">篇目分类：等待真实项目分类结果 · 布鲁姆：等待真实分类，不显示硬编码等级。</p>
          <ChatComposer value={input} onChange={setInput} onSubmit={submit} placeholder="输入你的古诗文问题…（Enter 发送，Shift+Enter 换行）" disabled={busy} blockedReason={workspaceState.providerBlocked ? '缺少 student_chat 模型能力配置。管理员配置真实 Provider 前，不会显示模拟回答。' : undefined} />
        </div>
      </div>
    </div>
  );
}
