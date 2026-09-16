import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { McpServerDialog } from '@/components/workbench/mcp-server-dialog';
import { getEnabledToolNames, McpServerList, type ServerRow } from '@/components/workbench/mcp-server-list';
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

  const servers = result.data as ServerRow[];
  const enabledCount = servers.filter((server) => server.is_enabled).length;
  const roleReadyCount = servers.filter((server) => server.is_enabled && server.allowed_roles.length > 0).length;
  const completeCount = servers.filter((server) => server.is_enabled && server.connection_ref && server.allowed_roles.length > 0 && getEnabledToolNames(server.enabled_tools).length > 0).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="MCP Server"
        description="查看远程地址、角色、工具白名单和最近一次连接测试；配置完整不等于已经连通。"
        metrics={[
          { label: 'Server', value: servers.length, hint: '已登记 MCP 能力' },
          { label: '已启用', value: enabledCount, hint: '显式 enabled' },
          { label: '配置完整', value: completeCount, hint: '地址、角色和工具均已填写' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="配置与授权"
          description="仅允许远程 https MCP；未知工具默认禁用，stdio 与隐式 fallback 都不会进入运行时。"
          action={<McpServerDialog />}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="text-base">启用概况</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p className="text-2xl font-semibold text-foreground">{enabledCount}</p>
              <p>{servers.length === 0 ? '还没有登记任何 Server。' : `共 ${servers.length} 个 Server，其中 ${enabledCount} 个已启用。`}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="text-base">角色投放</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p className="text-2xl font-semibold text-foreground">{roleReadyCount}</p>
              <p>只有启用且至少勾选教师或学生角色后，运行时才可能拿到工具入口。</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="text-base">白名单约束</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p className="text-2xl font-semibold text-foreground">deny</p>
              <p>未进入 enabled_tools 的工具默认不会暴露；空白名单等于零工具开放。</p>
            </CardContent>
          </Card>
        </div>

        <McpServerList servers={servers} />
      </section>
    </div>
  );
}
