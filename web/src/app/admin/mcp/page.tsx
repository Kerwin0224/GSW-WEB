import { Plus, Puzzle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminMcp } from '@/lib/data/admin';

export default async function AdminMcpPage() {
  const result = await getAdminMcp();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="MCP 能力加载失败" description={result.message} />
      </div>
    );
  }

  const servers = result.data as Array<{
    id: string;
    name: string;
    connection_ref: string | null;
    secret_last_four: string | null;
    health_status: string;
    allowed_roles: string[];
    is_enabled: boolean;
  }>;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="MCP 能力"
        title="外部工具只作为受控能力开放。"
        description="Supabase 保存能力元数据和连接引用；本机命令、token、环境变量只留在服务端 env。未知工具默认禁用。"
        metrics={[
          { label: 'Server', value: servers.length, hint: '已登记 MCP 能力' },
          { label: '启用', value: servers.filter((server) => server.is_enabled).length, hint: '显式 enabled' },
          { label: '策略', value: 'deny', hint: '未知工具默认禁用' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="能力治理"
          description="缺少本机 bridge env 时保持 blocked/offline，不做隐式 fallback。"
          action={<Button disabled><Plus className="mr-2 size-4" />添加 MCP Server</Button>}
        />
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Puzzle className="size-5" />MCP Server</CardTitle></CardHeader>
          <CardContent>
            {servers.length === 0 ? (
              <EmptyState title="暂无 MCP Server" description="未配置时学生与教师不会获得任何外部工具能力，也不会尝试隐式 fallback。" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Server</TableHead>
                    <TableHead>连接引用</TableHead>
                    <TableHead>健康</TableHead>
                    <TableHead>启用角色</TableHead>
                    <TableHead>密钥</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servers.map((server) => (
                    <TableRow key={server.id}>
                      <TableCell>{server.name}</TableCell>
                      <TableCell>{server.connection_ref ?? '未登记'}</TableCell>
                      <TableCell>{server.health_status}</TableCell>
                      <TableCell>{server.allowed_roles.join('、') || '未授权'}</TableCell>
                      <TableCell>{server.secret_last_four ? `••••${server.secret_last_four}` : '服务端 env'}</TableCell>
                      <TableCell>{server.is_enabled ? '启用' : '禁用'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="mt-4 flex items-center justify-between rounded-xl border p-3">
              <span className="text-sm">未知/高风险工具默认禁用；缺少本机 bridge env 时保持 blocked/offline</span>
              <Switch checked={false} disabled aria-label="未知工具默认禁用" />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
