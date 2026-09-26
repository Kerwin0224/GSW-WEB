'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FlaskConical, Loader2, Pencil, Plus, Puzzle, Trash2, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogCancelButton, AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { createMcpServer, deleteMcpServer, testMcpServerConnection, updateMcpServer, type AppRoleArray } from '@/lib/data/admin';
import type { Json } from '@/lib/supabase/database.types';

type RuntimeRole = 'teacher' | 'student';
type StoredRole = 'admin' | RuntimeRole;

type TestState = {
  ok: boolean;
  message: string;
  toolNames?: string[];
  healthStatus?: string;
};

export type McpServerInitialData = {
  id?: string;
  name?: string;
  description?: string | null;
  connectionRef?: string | null;
  secretLastFour?: string | null;
  enabledTools?: unknown;
  allowedRoles?: StoredRole[];
  isEnabled?: boolean;
};

type ParsedMcpConfig = {
  name: string;
  description: string;
  connectionRef: string;
  token: string;
  enabledTools: string[];
  metadata: Json;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatEnabledToolsText(value: unknown) {
  if (!Array.isArray(value)) return '';
  return uniqueStrings(value.filter((item): item is string => typeof item === 'string')).join('\n');
}

function parseEnabledToolsText(value: string) {
  return uniqueStrings(value.split(/[,\n]/g));
}

function extractBearerToken(entry: Record<string, unknown>) {
  const headers = asRecord(entry.headers);
  const headerValue = typeof headers?.Authorization === 'string'
    ? headers.Authorization
    : typeof headers?.authorization === 'string'
      ? headers.authorization
      : '';
  if (headerValue.toLowerCase().startsWith('bearer ')) return headerValue.slice(7).trim();
  if (typeof entry.token === 'string') return entry.token.trim();
  if (typeof entry.apiKey === 'string') return entry.apiKey.trim();
  if (typeof entry.api_key === 'string') return entry.api_key.trim();
  return '';
}

function parseEnabledTools(value: unknown) {
  if (Array.isArray(value)) return uniqueStrings(value.filter((item): item is string => typeof item === 'string'));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return uniqueStrings(
      Object.entries(value as Record<string, unknown>)
        .flatMap(([name, enabled]) => enabled ? [name] : [])
    );
  }
  return [];
}
/**
 * 解析一份 MCP JSON。
 *
 * 多 Server 的情况必须说清楚：一份 mcpServers 里常见十几个 Server，
 * 静默取第一个会让管理员以为"全都接进来了"，实际只接了一个。
 * 这里全部解析出来交给界面选择，并在界面上写明"本次只处理选中的这一个"。
 */
function parseMcpJsonServers(jsonText: string): ParsedMcpConfig[] {
  const parsed = JSON.parse(jsonText) as unknown;
  const root = asRecord(parsed);
  if (!root) throw new Error('MCP JSON 必须是对象。');

  const servers = asRecord(root.mcpServers) ?? asRecord(root.servers);
  if (servers) {
    const entries = Object.entries(servers).filter(([, value]) => Boolean(asRecord(value)));
    if (entries.length === 0) throw new Error('mcpServers 中没有可导入的 Server。');
    return entries.map(([serverName, value]) => parseMcpEntry(serverName, asRecord(value) ?? {}, parsed));
  }
  return [parseMcpEntry(typeof root.name === 'string' ? root.name.trim() : '', root, parsed)];
}

function parseMcpEntry(name: string, entry: Record<string, unknown>, raw: unknown): ParsedMcpConfig {
  const url = typeof entry.url === 'string' ? entry.url.trim() : '';
  const command = typeof entry.command === 'string' ? entry.command.trim() : '';
  if (!url && command) throw new Error('当前后台只支持远程 https MCP；stdio / command 型配置不能直接接入。');
  if (!url) throw new Error('MCP JSON 需要提供远程 url。');

  return {
    name,
    description: typeof entry.description === 'string' ? entry.description.trim() : '',
    connectionRef: url,
    token: extractBearerToken(entry),
    enabledTools: parseEnabledTools(entry.enabledTools ?? entry.enabled_tools ?? entry.tools),
    metadata: raw as Json,
  };
}

/** applyJson 会写入的字段：只覆盖这些，其余（角色、启用开关）由人自己勾。 */
const APPLY_FIELDS = [
  ['name', '显示名称'],
  ['description', '说明'],
  ['connectionRef', '连接地址'],
  ['token', 'Bearer Token'],
  ['enabledToolsText', '工具白名单'],
] as const;

function conflictingFields(parsed: ParsedMcpConfig, current: Record<string, string>) {
  const next: Record<string, string> = {};
  const incoming: Record<string, string> = {
    name: parsed.name,
    description: parsed.description,
    connectionRef: parsed.connectionRef,
    token: parsed.token,
    enabledToolsText: parsed.enabledTools.join('\n'),
  };
  for (const [field, label] of APPLY_FIELDS) {
    if (current[field] && current[field] !== incoming[field]) next[field] = label;
  }
  return next;
}

export function McpServerDialog({
  initial,
  mode = 'create',
}: {
  initial?: McpServerInitialData;
  mode?: 'create' | 'edit';
}) {
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [metadata, setMetadata] = useState<Json>({});
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [connectionRef, setConnectionRef] = useState(initial?.connectionRef ?? '');
  const [token, setToken] = useState('');
  const [enabledToolsText, setEnabledToolsText] = useState(formatEnabledToolsText(initial?.enabledTools));
  const [allowedRoles, setAllowedRoles] = useState<Set<RuntimeRole>>(new Set((initial?.allowedRoles ?? ['teacher', 'student']).filter((role): role is RuntimeRole => role === 'teacher' || role === 'student')));
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? true);
  const [showAdvanced, setShowAdvanced] = useState(mode === 'edit');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [parsedSummary, setParsedSummary] = useState<ParsedMcpConfig | null>(null);
  /** 解析出的全部 Server；多于一个时必须显式选一个，不静默取第一个。 */
  const [serverOptions, setServerOptions] = useState<ParsedMcpConfig[]>([]);
  const [selectedServer, setSelectedServer] = useState('');
  /** 解析结果会覆盖已填字段时，先摆出冲突清单等确认。 */
  const [pendingApply, setPendingApply] = useState<{ parsed: ParsedMcpConfig; conflicts: Record<string, string> } | null>(null);
  const [testState, setTestState] = useState<TestState | null>(null);
  /** 测试发现的工具只是草稿：白名单必须由人点"采用"才写进去。 */
  const [toolDraft, setToolDraft] = useState<string[] | null>(null);

  const [submitting, startTransition] = useTransition();
  const [testing, startTestTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toolNames = useMemo(() => parseEnabledToolsText(enabledToolsText), [enabledToolsText]);

  function currentFieldValues() {
    return { name, description: description ?? '', connectionRef, token, enabledToolsText };
  }

  function writeParsed(parsed: ParsedMcpConfig) {
    setParsedSummary(parsed);
    setName(parsed.name);
    setDescription(parsed.description);
    setConnectionRef(parsed.connectionRef);
    setToken(parsed.token);
    setEnabledToolsText(parsed.enabledTools.join('\n'));
    setMetadata(parsed.metadata);
    // 授权角色与启用开关不动：那是人在勾的，解析不该替他决定。
  }

  function applyJson() {
    setError(null);
    setTestState(null);
    setToolDraft(null);
    try {
      const servers = parseMcpJsonServers(jsonText);
      setServerOptions(servers);
      setSelectedServer(servers[0]?.name ?? '');
      const parsed = servers[0];
      const conflicts = conflictingFields(parsed, currentFieldValues());
      if (Object.keys(conflicts).length > 0) {
        setPendingApply({ parsed, conflicts });
        return;
      }
      writeParsed(parsed);
    } catch (parseError) {
      setServerOptions([]);
      setParsedSummary(null);
      setError(parseError instanceof Error ? parseError.message : 'MCP JSON 解析失败。');
    }
  }

  /** 多 Server 时按选择应用；仍然先过覆盖确认。 */
  function applySelectedServer() {
    const parsed = serverOptions.find((server) => server.name === selectedServer);
    if (!parsed) {
      setError('请先选择要接入的 Server。');
      return;
    }
    const conflicts = conflictingFields(parsed, currentFieldValues());
    if (Object.keys(conflicts).length > 0) {
      setPendingApply({ parsed, conflicts });
      return;
    }
    writeParsed(parsed);
  }

  function toggleRole(role: RuntimeRole) {
    const next = new Set(allowedRoles);
    if (next.has(role)) next.delete(role); else next.add(role);
    setAllowedRoles(next);
  }

  function buildInput() {
    return {
      name,
      description,
      connectionRef,
      token,
      enabledTools: toolNames,
      allowedRoles: Array.from(allowedRoles) as AppRoleArray,
      metadata,
      isEnabled,
      healthStatus: testState?.ok ? (testState.healthStatus ?? 'healthy') : 'unchecked',
    } satisfies Parameters<typeof createMcpServer>[0];
  }

  async function handleTest() {
    setError(null);
    setTestState(null);
    if (!jsonText.trim() && !connectionRef.trim()) {
      setError('请先粘贴 MCP JSON，或至少提供可测试的连接配置。');
      return;
    }

    startTestTransition(async () => {
      const result = await testMcpServerConnection(buildInput());
      if (!result.ok) {
        setTestState({ ok: false, message: result.message });
        return;
      }
      if (!name.trim()) setName(result.serverName);
      setConnectionRef(result.connectionRef);
      setTestState({ ok: true, message: result.message, toolNames: result.toolNames, healthStatus: result.healthStatus });
      // 只给草稿：自动写白名单等于把"上游声称有什么"当成"我们允许暴露什么"。
      setToolDraft(result.toolNames);
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!connectionRef.trim()) {
      setError('请先提供远程 MCP 地址。');
      return;
    }

    const input = buildInput();
    startTransition(async () => {
      const result = mode === 'edit' && initial?.id
        ? await updateMcpServer(initial.id, input)
        : await createMcpServer(input);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
    });
  }

  async function handleDelete() {
    const id = initial?.id;
    if (!id) return;

    startTransition(async () => {
      const result = await deleteMcpServer(id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setConfirmDeleteOpen(false);
    });
  }

  const trigger = mode === 'edit' ? (
    <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2">
      <Pencil className="size-3.5" />
      编辑
    </Button>
  ) : (
    <Button type="button" className="min-h-11">
      <Plus className="mr-2 size-4" />贴入 JSON 接入
    </Button>
  );

  return (
    <>
      <AdminDialogShell
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        title={mode === 'edit' ? '编辑 MCP Server' : '贴入 MCP JSON 接入'}
        description="可以粘贴 JSON 自动填充，也可以在高级选项中手动填写远程地址；保存前建议测试连接。"
        icon={<Puzzle className="size-5" />}
        className="max-w-2xl"
        footer={(
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              {mode === 'edit' && initial?.id ? (
                <Button type="button" variant="destructive" onClick={() => setConfirmDeleteOpen(true)} disabled={submitting || testing}>
                  <Trash2 className="mr-1 size-4" />删除
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={handleTest} disabled={submitting || testing} className="min-h-11">
                {testing ? <><Loader2 className="mr-2 size-4 animate-spin" />测试中…</> : <><FlaskConical className="mr-2 size-4" />测试连接</>}
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting || testing} className="min-h-11">
                {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存配置'}
              </Button>
            </div>
          </div>
        )}
      >
        <div className="space-y-5">
          <div className="rounded-lg border bg-muted/35 p-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">1. 贴 JSON</Badge>
              <Badge variant="secondary">2. 解析校验</Badge>
              <Badge variant="secondary">3. 测试连接</Badge>
              <Badge variant="secondary">4. 保存</Badge>
            </div>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>正常接入只需要一段 MCP JSON。</p>
              <p>系统会提取 URL、名称、token 与工具白名单；未提供工具列表时，可通过连接测试发现工具——发现结果只是草稿，采用后才写进白名单。</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-json">MCP JSON</Label>
            <Textarea
              id="mcp-json"
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              placeholder={'{\n  "mcpServers": {\n    "poetry": {\n      "url": "https://mcp.example.com/sse",\n      "headers": { "Authorization": "Bearer sk-..." },\n      "tools": ["search", "lookup"]\n    }\n  }\n}'}
              rows={12}
              className="font-mono text-xs"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={applyJson} disabled={!jsonText.trim()} className="min-h-11">
                解析 JSON
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAdvanced((value) => !value)} className="min-h-11">
                <ChevronDown className="mr-2 size-4" />
                {showAdvanced ? '收起高级选项' : '展开高级选项'}
              </Button>
            </div>
          </div>

          {serverOptions.length > 1 ? (
            <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-4">
              <Label htmlFor="mcp-server-choice">这份 JSON 里有 {serverOptions.length} 个 Server</Label>
              <Select value={selectedServer} onValueChange={(value) => setSelectedServer(value ?? '')}>
                <SelectTrigger id="mcp-server-choice"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {serverOptions.map((server) => (
                    <SelectItem key={server.name} value={server.name}>
                      {server.name} · {server.connectionRef}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-primary">一次只接入选中的这一个；其余 {serverOptions.length - 1} 个不会被处理，需要的话改用它们的 JSON 单独接入。</p>
                <Button type="button" variant="outline" size="sm" onClick={applySelectedServer}>应用所选 Server</Button>
              </div>
            </div>
          ) : null}

          {parsedSummary ? (
            <div className="rounded-lg border bg-background/70 p-4">
              <p className="text-sm font-medium text-foreground">解析结果</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Server 名称</p>
                  <p className="text-sm text-foreground">{parsedSummary.name || '留空时将自动使用域名'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">连接地址</p>
                  <p className="break-all text-sm text-foreground">{parsedSummary.connectionRef}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">鉴权</p>
                  <p className="text-sm text-foreground">{parsedSummary.token ? '已从 JSON 提取 Bearer Token' : 'JSON 中未发现 token'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">工具数</p>
                  <p className="text-sm text-foreground">{parsedSummary.enabledTools.length}</p>
                </div>
              </div>
            </div>
          ) : null}

          {testState ? (
            <Alert variant={testState.ok ? 'default' : 'destructive'}>
              {testState.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              <AlertTitle>{testState.ok ? 'MCP 测试通过' : 'MCP 测试失败'}</AlertTitle>
              <AlertDescription>
                <div className="space-y-2">
                  <p>{testState.message}</p>
                  {testState.ok && testState.toolNames && testState.toolNames.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {testState.toolNames.map((tool) => (
                        <Badge key={tool} variant="outline" className="font-mono text-[11px]">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {testState.ok && toolDraft && toolDraft.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
                      <p className="text-xs">待确认工具草稿：{toolDraft.length} 个。测试只证明上游声称提供这些工具，是否放进白名单由你决定。</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setEnabledToolsText(toolDraft.join('\n')); setToolDraft(null); }}
                      >
                        采用为白名单
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setToolDraft(null)}>忽略</Button>
                    </div>
                  ) : null}
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {showAdvanced ? (
            <div className="space-y-4 rounded-lg border border-dashed p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mcp-name">显示名称</Label>
                  <Input id="mcp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="留空时自动使用域名" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-description">说明</Label>
                  <Input id="mcp-description" value={description ?? ''} onChange={(event) => setDescription(event.target.value)} placeholder="例如：课堂检索、知识库问答" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-connection">远程 MCP 地址</Label>
                <Input id="mcp-connection" value={connectionRef} onChange={(event) => setConnectionRef(event.target.value)} placeholder="https://mcp.example.com/sse" autoComplete="off" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-token">Bearer Token / 密钥</Label>
                <Input
                  id="mcp-token"
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder={mode === 'edit' && initial?.secretLastFour ? `已保存（末四位 ${initial.secretLastFour}），留空保持不变` : '直接粘贴 token，留空表示无需认证'}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-tools">工具白名单</Label>
                <Textarea
                  id="mcp-tools"
                  value={enabledToolsText}
                  onChange={(event) => setEnabledToolsText(event.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                  placeholder={'search\nfetch_document\nlookup_class_schedule'}
                />
                <p className="text-xs text-muted-foreground">每行或逗号分隔一个工具名；测试发现的工具不会自动写入，需要在上方点「采用为白名单」。</p>
              </div>

            </div>
          ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium leading-none">运行时授权角色</p>
                <div className="flex flex-wrap gap-3 rounded-md border p-3">
                  {(['teacher', 'student'] as RuntimeRole[]).map((role) => (
                    <label key={role} htmlFor={`mcp-role-${role}`} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox id={`mcp-role-${role}`} checked={allowedRoles.has(role)} onCheckedChange={() => toggleRole(role)} />
                      {role === 'teacher' ? '教师' : '学生'}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox checked={isEnabled} onCheckedChange={(value) => setIsEnabled(Boolean(value))} id="mcp-enabled" />
                <Label htmlFor="mcp-enabled" className="cursor-pointer">保存后立即启用此 Server</Label>
              </div>

          {/* 保存前把"到底会开放什么"摆平：工具数、角色、启用状态缺一项都可能让人误判影响面。 */}
          <div className="rounded-lg border bg-muted/35 p-4">
            <p className="text-sm font-medium">保存前确认</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">工具白名单</dt>
                <dd className="text-sm">{toolNames.length} 个{toolDraft && toolDraft.length > 0 ? `（另有 ${toolDraft.length} 个草稿未采用）` : ''}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">授权角色</dt>
                <dd className="text-sm">{allowedRoles.size === 0 ? '未授权（保存后不会向任何人开放）' : Array.from(allowedRoles).map((role) => (role === 'teacher' ? '教师' : '学生')).join('、')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">启用状态</dt>
                <dd className="text-sm">{isEnabled ? '保存后立即启用' : '保存为禁用（运行时不会调用）'}</dd>
              </div>
            </dl>
            {isEnabled && toolNames.length === 0 ? (
              <p className="mt-2 text-xs text-destructive">已勾选启用但白名单为空：保存后这个 Server 不会向教师或学生开放任何工具。</p>
            ) : null}
            {isEnabled && allowedRoles.size === 0 ? (
              <p className="mt-2 text-xs text-destructive">已勾选启用但没有授权角色：运行时拿不到任何工具入口。</p>
            ) : null}
          </div>
          {error ? (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </AdminDialogShell>

      {/* applyJson 的覆盖确认：不确认就保留手填内容。 */}
      <AdminDialogShell
        open={pendingApply !== null}
        onOpenChange={(next) => { if (!next) setPendingApply(null); }}
        title="解析结果会覆盖已填内容"
        description="下面这些字段你已经手动填过，解析 JSON 会用 JSON 里的值替换它们。"
        icon={<AlertTriangle className="size-5" />}
        className="max-w-lg"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setPendingApply(null)}>保留我的填写</Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingApply) writeParsed(pendingApply.parsed);
                setPendingApply(null);
              }}
            >
              仍用 JSON 覆盖
            </Button>
          </>
        )}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {pendingApply ? Object.values(pendingApply.conflicts).map((label) => <li key={label}>{label}</li>) : null}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">授权角色与启用开关不会被解析改动。</p>
      </AdminDialogShell>

      {mode === 'edit' && initial?.id ? (
        <AdminDialogShell
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          title={`删除 MCP Server「${name || '未命名'}」`}
          description="删除后该 Server 授权角色将失去对应工具入口。"
          icon={<Trash2 className="size-5" />}
          className="max-w-md"
          footer={(
            <>
              <AdminDialogCancelButton onClick={() => setConfirmDeleteOpen(false)} />
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={submitting || testing}>
                {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />删除中…</> : '确认删除'}
              </Button>
            </>
          )}
        >
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertDescription>此操作不可在界面内恢复。</AlertDescription>
          </Alert>
        </AdminDialogShell>
      ) : null}
    </>
  );
}
