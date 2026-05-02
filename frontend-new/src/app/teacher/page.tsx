'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AIMessageList } from '@/components/workbench/ai-message-list';
import { ChatComposer } from '@/components/workbench/chat-composer';
import { BlockedState, EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';

const presets: Array<{ id: string; title: string; version: string; scenario: string; variables: string[]; status: 'published' | 'draft' }> = [];

export default function TeacherChatPage() {
  const [input, setInput] = useState('');
  const [presetId, setPresetId] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({ transport: new DefaultChatTransport({ api: '/api/teacher/chat' }) });
  const busy = status === 'submitted' || status === 'streaming';
  const selectedPreset = presets.find((preset) => preset.id === presetId);
  const providerReady = false;
  const loading = false;
  const permissionDenied = false;
  const materialSaved = false;

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || !selectedPreset || !providerReady) return;
    sendMessage({ parts: [{ type: 'text', text }] }, { body: { presetId: selectedPreset.id } });
    setInput('');
  };

  if (loading) return <LoadingSurface label="正在加载教学对话工作台" className="m-6" />;
  if (permissionDenied) return <div className="p-6"><PermissionState title="无法访问教师工作台" description="当前账号没有教师角色或班级范围。" /></div>;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="border-b bg-card/50 px-4 py-4">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-[20rem_1fr]">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="font-heading text-lg">教学预设</CardTitle><CardDescription>教师只能使用管理员发布的全局预设。</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {presets.length === 0 ? <BlockedState title="暂无已发布预设" description="请管理员先在 Prompt 预设中发布真实 System Instruction；这里不会提供通用模拟预设。" /> : null}
              <div className="space-y-2"><Label htmlFor="preset">选择预设</Label><Select value={presetId} onValueChange={(value) => setPresetId(value ?? '')} disabled={presets.length === 0}><SelectTrigger id="preset"><SelectValue placeholder="选择已发布预设" /></SelectTrigger><SelectContent>{presets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.title} {preset.version}</SelectItem>)}</SelectContent></Select></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="font-heading text-lg">预设元数据</CardTitle><CardDescription>发送前可检查场景、版本与变量。</CardDescription></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{selectedPreset ? <dl className="grid gap-2"><dt>场景</dt><dd>{selectedPreset.scenario}</dd><dt>变量</dt><dd>{selectedPreset.variables.join('、') || '无'}</dd></dl> : '尚未选择真实发布预设。'}</CardContent>
          </Card>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6"><div className="mx-auto max-w-3xl space-y-6">{messages.length === 0 ? <EmptyState title="选择预设后开始教学对话" description="可用于备课、讲解、追问、练习设计或学情分析；缺少预设或 Provider 时保持阻塞。" /> : <AIMessageList messages={messages} />}{materialSaved ? <SuccessState title="教学材料已保存" description="真实教师对话产物保存成功后才显示提交状态。" /> : null}{busy ? <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />AI 正在生成教学支持…</div> : null}{error ? <ErrorState title="教学 AI 响应失败" description={error.message} /> : null}</div></div>
      <div className="border-t bg-background p-4"><div className="mx-auto max-w-3xl"><ChatComposer value={input} onChange={setInput} onSubmit={submit} placeholder="输入教学问题…" disabled={busy || !selectedPreset || !providerReady} blockedReason={!providerReady ? '缺少 teacher_chat 模型能力配置。' : undefined} /></div></div>
    </div>
  );
}
