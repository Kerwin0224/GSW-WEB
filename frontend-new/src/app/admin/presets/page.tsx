'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { BlockedState, EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';

export default function AdminPresetsPage() {
  const presets: Array<{ id: string }> = [];
  const loading = false;
  const error: string | null = null;
  const permissionDenied = false;
  const validationBlocked = false;
  const presetCommitted = false;
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex items-center justify-between"><div><h1 className="font-heading text-3xl">Prompt 预设</h1><p className="text-sm text-muted-foreground">生命周期：draft → published → disabled；教师只能使用 published。</p></div><Dialog><DialogTrigger render={<Button><Plus className="mr-2 size-4" />新建预设</Button>} /><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>新建 Prompt 预设</DialogTitle><DialogDescription>保存为草稿或发布新版本，历史互动可追踪版本。</DialogDescription></DialogHeader><div className="grid gap-4 py-4"><div className="space-y-2"><Label>标题</Label><Input placeholder="苏格拉底式引导" /></div><div className="space-y-2"><Label>教学场景</Label><Input placeholder="课堂追问 / 练习设计" /></div><div className="space-y-2"><Label>System Instruction</Label><Textarea className="min-h-32 font-mono" /></div><div className="space-y-2"><Label>变量</Label><Input placeholder="篇目, 年级, 学生误区" /></div><div className="space-y-2"><Label>状态</Label><Select><SelectTrigger><SelectValue placeholder="draft" /></SelectTrigger><SelectContent><SelectItem value="draft">draft</SelectItem><SelectItem value="published">published</SelectItem><SelectItem value="disabled">disabled</SelectItem></SelectContent></Select></div></div><DialogFooter><Button variant="outline">保存草稿</Button><Button>发布版本</Button></DialogFooter></DialogContent></Dialog></div>{loading ? <LoadingSurface label="正在加载 Prompt 预设" /> : null}{permissionDenied ? <PermissionState title="无权管理 Prompt 预设" description="当前账号缺少管理员角色。" /> : null}{validationBlocked ? <BlockedState title="预设校验未通过" description="System Instruction 或变量不完整时，不会发布给教师使用。" /> : null}{presetCommitted ? <SuccessState title="Prompt 预设已保存" description="发布状态确认后，教师才能选择该预设。" /> : null}{error ? <ErrorState title="Prompt 预设加载失败" description={error} /> : null}<div className="rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>标题</TableHead><TableHead>场景</TableHead><TableHead>版本</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{presets.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState title="暂无 Prompt 预设" description="发布真实预设前，教师教学对话保持阻塞。" /></TableCell></TableRow> : null}</TableBody></Table></div></div>;
}
