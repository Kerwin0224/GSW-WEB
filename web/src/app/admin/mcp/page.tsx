import { CheckCircle2, KeyRound, Link2, Puzzle, ShieldAlert, Wrench, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { McpServerDialog } from '@/components/workbench/mcp-server-dialog';
import { RoleBadge } from '@/components/workbench/role-badge';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminMcp } from '@/lib/data/admin';

type Role = 'admin' | 'teacher' | 'student';

type ServerRow = {
  id: string;
  name: string;
  description: string | null;
  connection_ref: string | null;
  secret_ref: string | null;
  secret_last_four: string | null;
  health_status: string;
  enabled_tools: unknown;
  allowed_roles: Role[];
  is_enabled: boolean;
  last_health_check_at?: string | null;
  last_health_latency_ms?: number | null;
};

function getEnabledToolNames(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function getTransportLabel(connectionRef: string | null) {
  if (!connectionRef) return '未登记';
  if (connectionRef.startsWith('sse:')) return 'SSE';
  if (connectionRef.startsWith('http-mcp:')) return 'HTTP MCP';
  if (connectionRef.startsWith('https://')) return 'HTTPS';
  if (connectionRef.startsWith('http://')) return 'HTTP';
  return '自定义';
}

function getRiskSummary(server: ServerRow, toolCount: number) {
  if (!server.is_enabled) return { label: '未启用', tone: 'secondary' as const, icon: XCircle, note: '已保存但不会向任何角色开放。' };
  if (server.allowed_roles.length === 0) return { label: '未授权', tone: 'destructive' as const, icon: ShieldAlert, note: '已启用但没有任何运行时角色可用。' };
  if (toolCount === 0) return { label: '零工具', tone: 'secondary' as const, icon: Wrench, note: '即使角色已授权，也不会暴露任何工具。' };
  return { label: '可投放', tone: 'default' as const, icon: CheckCircle2, note: '角色、连接与工具白名单都已具备。' };
}

function renderHealthBadge(server: ServerRow) {
  const status = server.health_status;
  const lastAt = server.last_health_check_at;
  const latency = server.last_health_latency_ms;

  let variant: 'default' | 'destructive' | 'secondary' = 'secondary';
  let icon = null as React.ReactNode;
  let label = '未测速';

  if (status === 'healthy') {
    variant = 'default';
    icon = <CheckCircle2 className="size-3" />;
    label = latency ? `健康 · ${latency}ms` : '健康';
  } else if (status === 'failed' || status === 'blocked') {
    variant = 'destructive';
    icon = <XCircle className="size-3" />;
    label = status === 'blocked' ? '已阻塞' : '失败';
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={variant} className="w-fit gap-1">
        {icon}
        {label}
      </Badge>
      {lastAt ? <span className="text-[10px] text-muted-foreground">{new Date(lastAt).toLocaleString('zh-CN')}</span> : null}
    </div>
  );
}

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
  const usableCount = servers.filter((server) => server.is_enabled && server.allowed_roles.length > 0 && getEnabledToolNames(server.enabled_tools).length > 0).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="MCP 能力"
        title="把外部工具收敛成可审计、可投放的远程能力。"
        description="这里优先回答三个问题：这个 Server 能不能连、会开放给谁、到底会暴露几个工具。管理员只需要维护远程 URL、角色与白名单。"
        metrics={[
          { label: 'Server', value: servers.length, hint: '已登记 MCP 能力' },
          { label: '已启用', value: enabledCount, hint: '显式 enabled' },
          { label: '可投放', value: usableCount, hint: '角色和工具都已就绪' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="能力治理"
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Puzzle className="size-5" />MCP Server 列表
            </CardTitle>
          </CardHeader>
          <CardContent>
            {servers.length === 0 ? (
              <EmptyState
                title="暂无 MCP Server"
                description="未配置时学生与教师不会获得任何外部工具能力，也不会尝试隐式 fallback。"
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {servers.map((server) => {
                  const tools = getEnabledToolNames(server.enabled_tools);
                  const risk = getRiskSummary(server, tools.length);
                  const RiskIcon = risk.icon;
                  return (
                    <Card key={server.id} className="border-border/70 bg-card/95 shadow-soft transition-shadow duration-200 hover:shadow-lg">
                      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">{server.name}</CardTitle>
                            <Badge variant={risk.tone} className="gap-1">
                              <RiskIcon className="size-3.5" />
                              {risk.label}
                            </Badge>
                            <Badge variant="outline">{getTransportLabel(server.connection_ref)}</Badge>
                          </div>
                          {server.description ? (
                            <p className="text-sm leading-6 text-muted-foreground">{server.description}</p>
                          ) : (
                            <p className="text-sm leading-6 text-muted-foreground">未填写说明；建议补一句用途，方便后续治理与排查。</p>
                          )}
                        </div>
                        <div className="shrink-0">
                          <McpServerDialog
                            mode="edit"
                            initial={{
                              id: server.id,
                              name: server.name,
                              description: server.description,
                              connectionRef: server.connection_ref,
                              secretLastFour: server.secret_last_four,
                              enabledTools: server.enabled_tools,
                              allowedRoles: server.allowed_roles,
                              isEnabled: server.is_enabled,
                            }}
                          />
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-5 text-sm">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2 rounded-lg border bg-muted/25 p-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Link2 className="size-4" />
                              <span className="font-medium">连接引用</span>
                            </div>
                            <code className="block overflow-x-auto rounded-md bg-background px-3 py-2 text-xs text-foreground">
                              {server.connection_ref ?? '未登记'}
                            </code>
                          </div>
                          <div className="space-y-2 rounded-lg border bg-muted/25 p-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <KeyRound className="size-4" />
                              <span className="font-medium">鉴权状态</span>
                            </div>
                            <p className="text-foreground">{server.secret_last_four ? `已保存密钥 ••••${server.secret_last_four}` : '未保存密钥'}</p>
                            <p className="text-xs text-muted-foreground">{server.secret_last_four ? '编辑时留空可保持不变。' : '若上游远程 MCP 需要 Bearer Token，请在编辑中补充。'}</p>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="rounded-lg border p-4">
                            <p className="text-xs text-muted-foreground">运行时健康</p>
                            <div className="mt-2">
                              {renderHealthBadge(server)}
                            </div>
                          </div>
                          <div className="rounded-lg border p-4">
                            <p className="text-xs text-muted-foreground">授权角色</p>
                            <div className="mt-2 flex min-h-10 flex-wrap gap-2">
                              {server.allowed_roles.filter((role): role is 'teacher' | 'student' => role === 'teacher' || role === 'student').length > 0 ? (
                                server.allowed_roles
                                  .filter((role): role is 'teacher' | 'student' => role === 'teacher' || role === 'student')
                                  .map((role) => <RoleBadge key={role} role={role} />)
                              ) : (
                                <Badge variant="outline">未授权</Badge>
                              )}
                            </div>
                          </div>
                          <div className="rounded-lg border p-4">
                            <p className="text-xs text-muted-foreground">工具白名单</p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">{tools.length}</p>
                            <p className="text-xs text-muted-foreground">{tools.length > 0 ? '只暴露白名单中的工具。' : '当前不会开放任何工具。'}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-foreground">工具明细</p>
                            <Badge variant={server.is_enabled ? 'default' : 'secondary'}>{server.is_enabled ? '启用中' : '已禁用'}</Badge>
                          </div>
                          <div className="rounded-lg border bg-muted/20 p-3">
                            {tools.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {tools.map((tool) => (
                                  <Badge key={tool} variant="outline" className="max-w-full overflow-hidden text-ellipsis font-mono text-[11px]">
                                    {tool}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">未填写 enabled_tools；运行时会按 deny 策略处理，不向教师或学生开放工具。</p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">治理提示</p>
                          <p className="mt-1 leading-6">{risk.note}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
