'use client';

import { Plus, Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BlockedState, EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';

export default function AdminMcpPage() {
  const servers: Array<{ id: string }> = [];
  const loading = false;
  const error: string | null = null;
  const permissionDenied = false;
  const capabilityBlocked = false;
  const configCommitted = false;
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex items-center justify-between"><div><h1 className="font-heading text-3xl">MCP 能力</h1><p className="text-sm text-muted-foreground">外部工具默认关闭；按角色和动作显式启用。</p></div><Button><Plus className="mr-2 size-4" />添加 MCP Server</Button></div>{loading ? <LoadingSurface label="正在加载 MCP 能力" /> : null}{permissionDenied ? <PermissionState title="无权配置 MCP 能力" description="当前账号缺少管理员角色。" /> : null}{capabilityBlocked ? <BlockedState title="MCP 能力未启用" description="工具必须经过健康检查与角色/动作授权，默认不会开放。" /> : null}{configCommitted ? <SuccessState title="MCP 配置已保存" description="明确启用的工具才会出现在对应角色动作中。" /> : null}{error ? <ErrorState title="MCP 能力加载失败" description={error} /> : null}<Card><CardHeader><CardTitle className="flex items-center gap-2"><Puzzle className="size-5" />能力治理</CardTitle></CardHeader><CardContent>{servers.length === 0 ? <EmptyState title="暂无 MCP Server" description="未配置时学生与教师不会获得任何外部工具能力，也不会尝试隐式 fallback。" /> : <Table><TableHeader><TableRow><TableHead>Server</TableHead><TableHead>健康</TableHead><TableHead>学生</TableHead><TableHead>教师</TableHead><TableHead>管理员</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell colSpan={5}>无</TableCell></TableRow></TableBody></Table>}<div className="mt-4 flex items-center justify-between rounded-xl border p-3"><span className="text-sm">未知/高风险工具默认禁用</span><Switch checked={false} disabled aria-label="未知工具默认禁用" /></div></CardContent></Card></div>;
}
