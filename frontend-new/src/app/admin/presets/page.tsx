import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { getAdminPresets, savePromptPreset } from '@/lib/data/admin';

export default async function AdminPresetsPage() {
  const result = await getAdminPresets();
  if (!result.ok) return <div className="p-6"><ErrorState title="Prompt 预设加载失败" description={result.message} /></div>;
  const presets = result.data as Array<{ id: string; title: string; scenario: string; version: number; status: string }>;
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex items-center justify-between"><div><h1 className="font-heading text-3xl">Prompt 预设</h1><p className="text-sm text-muted-foreground">生命周期：draft → published → disabled；教师只能使用 published。</p></div><Dialog><DialogTrigger render={<Button><Plus className="mr-2 size-4" />新建预设</Button>} /><DialogContent className="max-w-2xl"><form action={savePromptPreset}><DialogHeader><DialogTitle>新建 Prompt 预设</DialogTitle><DialogDescription>保存为草稿或发布新版本，历史互动可追踪版本。</DialogDescription></DialogHeader><div className="grid gap-4 py-4"><div className="space-y-2"><Label htmlFor="title">标题</Label><Input id="title" name="title" placeholder="苏格拉底式引导" /></div><div className="space-y-2"><Label htmlFor="scenario">教学场景</Label><Input id="scenario" name="scenario" placeholder="课堂追问 / 练习设计" /></div><div className="space-y-2"><Label htmlFor="system_instruction">System Instruction</Label><Textarea id="system_instruction" name="system_instruction" className="min-h-32 font-mono" /></div><div className="space-y-2"><Label htmlFor="variables">变量</Label><Input id="variables" name="variables" placeholder="篇目, 年级, 学生误区" /></div><div className="space-y-2"><Label>状态</Label><Select name="status" defaultValue="draft"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">draft</SelectItem><SelectItem value="published">published</SelectItem><SelectItem value="disabled">disabled</SelectItem></SelectContent></Select></div></div><DialogFooter><Button type="submit">保存预设</Button></DialogFooter></form></DialogContent></Dialog></div><div className="rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>标题</TableHead><TableHead>场景</TableHead><TableHead>版本</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{presets.length === 0 ? <TableRow><TableCell colSpan={4}><EmptyState title="暂无 Prompt 预设" description="发布真实预设前，教师教学对话保持阻塞。" /></TableCell></TableRow> : presets.map((preset) => <TableRow key={preset.id}><TableCell>{preset.title}</TableCell><TableCell>{preset.scenario}</TableCell><TableCell>v{preset.version}</TableCell><TableCell>{preset.status}</TableCell></TableRow>)}</TableBody></Table></div></div>;
}
