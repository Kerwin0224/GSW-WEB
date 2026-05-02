'use client';

import { useState } from 'react';
import { Filter } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';

export default function TeacherAuditPage() {
  const [quality, setQuality] = useState('accurate');
  const [corrected, setCorrected] = useState('');
  const [rationale, setRationale] = useState('');
  const [chosen, setChosen] = useState('');
  const [rejected, setRejected] = useState('');
  const records: Array<{ id: string }> = [];
  const loading = false;
  const permissionDenied = false;
  const loadError: string | null = null;
  const auditCommitted = false;
  const sftIncomplete = quality !== 'accurate' && (!corrected.trim() || !rationale.trim());
  const dpoIncomplete = !chosen.trim() || !rejected.trim() || !rationale.trim();

  return (
    <div className="grid h-[calc(100vh-3rem)] gap-0 lg:grid-cols-[22rem_1fr_26rem]">
      <aside className="border-r p-4">
        <div className="mb-4 flex items-center justify-between"><h1 className="font-heading text-xl">审计队列</h1><Button variant="outline" size="sm"><Filter className="mr-2 size-4" />筛选</Button></div>
        <div className="grid gap-2"><Select><SelectTrigger><SelectValue placeholder="班级" /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem></SelectContent></Select><Input placeholder="学生 / 记录搜索" /></div>
        <div className="mt-4 space-y-3">{loading ? <LoadingSurface label="正在加载审计队列" /> : null}{permissionDenied ? <PermissionState title="无权访问审计队列" description="教师只能查看已分配班级范围内的真实互动记录。" /> : null}{loadError ? <ErrorState title="审计队列加载失败" description={loadError} /> : null}{auditCommitted ? <SuccessState title="标注已提交" description="真实源记录校验通过后，SFT/DPO 标注会进入待导出状态。" /> : null}{records.length === 0 ? <EmptyState title="暂无待审计真实记录" description="学生或教师产生真实 AI 互动后，符合条件的记录才会进入队列。不会显示演示记录。" /> : null}</div>
      </aside>
      <main className="overflow-y-auto p-4">
        <Card className="min-h-full"><CardHeader><CardTitle className="font-heading">源对话上下文</CardTitle></CardHeader><CardContent><EmptyState title="请选择一条源记录" description="标注时源问题、模型回答、学生/班级/篇目/Bloom 元数据会保持可见，避免脱离上下文。" /></CardContent></Card>
      </main>
      <aside className="overflow-y-auto border-l p-4">
        <h2 className="mb-4 font-heading text-xl">SFT / DPO 标注</h2>
        <Tabs defaultValue="sft"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="sft">SFT</TabsTrigger><TabsTrigger value="dpo">DPO</TabsTrigger></TabsList>
          <TabsContent value="sft" className="space-y-4 pt-4"><div className="space-y-2"><Label>AI 回答质量</Label><RadioGroup value={quality} onValueChange={(value) => setQuality(value ?? 'accurate')}><div className="flex items-center gap-2"><RadioGroupItem value="accurate" id="accurate" /><Label htmlFor="accurate">准确</Label></div><div className="flex items-center gap-2"><RadioGroupItem value="needs_correction" id="needs" /><Label htmlFor="needs">需要修正</Label></div><div className="flex items-center gap-2"><RadioGroupItem value="reject" id="reject" /><Label htmlFor="reject">拒绝入库</Label></div></RadioGroup></div><div className="space-y-2"><Label htmlFor="corrected">修正后答案</Label><Textarea id="corrected" value={corrected} onChange={(e) => setCorrected(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="rationale">理由</Label><Textarea id="rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} /></div><Button disabled={records.length === 0 || sftIncomplete} className="w-full">提交 SFT 标注</Button></TabsContent>
          <TabsContent value="dpo" className="space-y-4 pt-4"><div className="space-y-2"><Label>Chosen 答案</Label><Textarea value={chosen} onChange={(e) => setChosen(e.target.value)} /></div><div className="space-y-2"><Label>Rejected 答案</Label><Textarea value={rejected} onChange={(e) => setRejected(e.target.value)} /></div><div className="space-y-2"><Label>偏好理由</Label><Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} /></div><Button disabled={records.length === 0 || dpoIncomplete} className="w-full">提交 DPO 标注</Button></TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}
