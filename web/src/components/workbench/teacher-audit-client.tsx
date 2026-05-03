'use client';

import { useActionState, useState } from 'react';
import { Filter } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/workbench/state-surfaces';
import type { AuditQueueRecord } from '@/lib/data/teacher';
import { submitDpoAudit, submitSftAudit, type AuditSubmissionState } from '@/lib/data/teacher-actions';

const initialState: AuditSubmissionState = { ok: false, message: '' };

function FormStatus({ state }: { state: AuditSubmissionState }) {
  if (!state.message) return null;
  return (
    <p
      className={state.ok ? 'rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-green-800' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'}
      role={state.ok ? 'status' : 'alert'}
    >
      {state.message}
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

export function TeacherAuditClient({ records }: { records: AuditQueueRecord[] }) {
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? '');
  const [quality, setQuality] = useState('accurate');
  const [corrected, setCorrected] = useState('');
  const [rationale, setRationale] = useState('');
  const [chosen, setChosen] = useState('');
  const [rejected, setRejected] = useState('');
  const selected = records.find((record) => record.id === selectedId);
  const [sftState, sftAction, sftPending] = useActionState(selected ? submitSftAudit.bind(null, selected.sourceMessageId) : async (): Promise<AuditSubmissionState> => ({ ok: false, message: '请选择源记录。' }), initialState);
  const [dpoState, dpoAction, dpoPending] = useActionState(selected ? submitDpoAudit.bind(null, selected.sourceMessageId) : async (): Promise<AuditSubmissionState> => ({ ok: false, message: '请选择源记录。' }), initialState);
  const sftIncomplete = quality !== 'accurate' && ((quality === 'needs_correction' && !corrected.trim()) || !rationale.trim());
  const dpoIncomplete = !chosen.trim() || !rejected.trim() || !rationale.trim();

  const selectRecord = (record: AuditQueueRecord) => {
    setSelectedId(record.id);
    setQuality('accurate');
    setCorrected('');
    setRationale('');
    setChosen(record.answer);
    setRejected('');
  };

  return (
    <div className="grid h-[calc(100vh-3rem)] gap-0 lg:grid-cols-[22rem_1fr_26rem]">
      <aside className="border-r p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-heading text-xl">审计队列</h1>
          <Button variant="outline" size="sm"><Filter className="mr-2 size-4" />筛选</Button>
        </div>
        <div className="grid gap-2">
          <Select>
            <SelectTrigger><SelectValue placeholder="班级" /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部班级</SelectItem></SelectContent>
          </Select>
          <Input placeholder="学生 / 记录搜索" />
        </div>
        <div className="mt-4 space-y-3">
          {records.length === 0 ? (
            <EmptyState title="暂无待审计真实记录" description="学生或教师产生真实 AI 互动后，符合条件的记录才会进入队列。不会显示演示记录。" />
          ) : (
            records.map((record) => (
              <button key={record.id} onClick={() => selectRecord(record)} className="w-full rounded-xl border p-3 text-left text-sm hover:bg-muted">
                <span className="font-medium">{record.answer.slice(0, 48)}...</span>
                <br />
                <span className="text-xs text-muted-foreground">{new Date(record.createdAt).toLocaleString('zh-CN')}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="overflow-y-auto p-4">
        <Card className="min-h-full">
          <CardHeader><CardTitle className="font-heading">源对话上下文</CardTitle></CardHeader>
          <CardContent>
            {selected ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Conversation: {selected.conversationId}</p>
                <div className="rounded-xl border p-3"><strong>Prompt</strong><p>{selected.prompt}</p></div>
                <div className="rounded-xl border p-3"><strong>Model Answer</strong><p>{selected.answer}</p></div>
              </div>
            ) : (
              <EmptyState title="请选择一条源记录" description="标注时源问题、模型回答、学生/班级/篇目/Bloom 元数据会保持可见，避免脱离上下文。" />
            )}
          </CardContent>
        </Card>
      </main>

      <aside className="overflow-y-auto border-l p-4">
        <h2 className="mb-4 font-heading text-xl">SFT / DPO 标注</h2>
        <Tabs defaultValue="sft">
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="sft">SFT</TabsTrigger><TabsTrigger value="dpo">DPO</TabsTrigger></TabsList>
          <TabsContent value="sft" className="space-y-4 pt-4">
            <form action={sftAction} className="space-y-4">
              <input type="hidden" name="prompt" value={selected?.prompt ?? ''} />
              <input type="hidden" name="original_answer" value={selected?.answer ?? ''} />
              <div className="space-y-2">
                <Label>AI 回答质量</Label>
                <RadioGroup name="quality" value={quality} onValueChange={(value) => setQuality(value ?? 'accurate')}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="accurate" id="accurate" /><Label htmlFor="accurate">准确</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="needs_correction" id="needs" /><Label htmlFor="needs">需要修正</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="reject" id="reject" /><Label htmlFor="reject">拒绝入库</Label></div>
                </RadioGroup>
                <FieldError message={sftState.errors?.quality} />
              </div>
              <div className="space-y-2"><Label htmlFor="corrected">修正后答案</Label><Textarea id="corrected" name="corrected_answer" value={corrected} onChange={(event) => setCorrected(event.target.value)} /><FieldError message={sftState.errors?.corrected_answer} /></div>
              <div className="space-y-2"><Label htmlFor="rationale">理由</Label><Textarea id="rationale" name="rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} /><FieldError message={sftState.errors?.rationale} /></div>
              <FormStatus state={sftState} />
              <Button disabled={!selected || sftPending || sftIncomplete} className="w-full">提交 SFT 标注</Button>
            </form>
          </TabsContent>
          <TabsContent value="dpo" className="space-y-4 pt-4">
            <form action={dpoAction} className="space-y-4">
              <input type="hidden" name="prompt" value={selected?.prompt ?? ''} />
              <input type="hidden" name="original_answer" value={selected?.answer ?? ''} />
              <div className="space-y-2"><Label htmlFor="chosen_answer">Chosen 答案</Label><Textarea id="chosen_answer" name="chosen_answer" value={chosen} onChange={(event) => setChosen(event.target.value)} /><FieldError message={dpoState.errors?.chosen_answer} /></div>
              <div className="space-y-2"><Label htmlFor="rejected_answer">Rejected 答案</Label><Textarea id="rejected_answer" name="rejected_answer" value={rejected} onChange={(event) => setRejected(event.target.value)} /><FieldError message={dpoState.errors?.rejected_answer} /></div>
              <div className="space-y-2"><Label htmlFor="preference_rationale">偏好理由</Label><Textarea id="preference_rationale" name="preference_rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} /><FieldError message={dpoState.errors?.preference_rationale} /></div>
              <FormStatus state={dpoState} />
              <Button disabled={!selected || dpoPending || dpoIncomplete} className="w-full">提交 DPO 标注</Button>
            </form>
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}
