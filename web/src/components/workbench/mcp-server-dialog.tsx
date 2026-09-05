'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckCircle2, ChevronDown, FlaskConical, Loader2, Pencil, Plus, Puzzle, Trash2, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function parseMcpJson(jsonText: string): ParsedMcpConfig {
  const parsed = JSON.parse(jsonText) as unknown;
  const root = asRecord(parsed);
  if (!root) throw new Error('MCP JSON 必须是对象。');

  const servers = asRecord(root.mcpServers) ?? asRecord(root.servers);
  let name = typeof root.name === 'string' ? root.name.trim() : '';
  let entry = root;

  if (servers) {
    const first = Object.entries(servers).find(([, value]) => Boolean(asRecord(value)));
    if (!first) throw new Error('mcpServers 中没有可导入的 Server。');
    name = first[0];
    entry = asRecord(first[1]) ?? {};
  }

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
    metadata: parsed as Json,
  };
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
  const [testState, setTestState] = useState<TestState | null>(null);

  const [submitting, startTransition] = useTransition();
  const [testing, startTestTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toolNames = useMemo(() => parseEnabledToolsText(enabledToolsText), [enabledToolsText]);

  function applyJson() {
    setError(null);
    setTestState(null);
    try {
      const parsed = parseMcpJson(jsonText);
      setParsedSummary(parsed);
      setName(parsed.name);
      setDescription(parsed.description);
      setConnectionRef(parsed.connectionRef);
      setToken(parsed.token);
      setEnabledToolsText(parsed.enabledTools.join('\n'));
      setMetadata(parsed.metadata);
      setAllowedRoles(new Set<RuntimeRole>(['teacher', 'student']));
      setIsEnabled(true);
    } catch (parseError) {
      setParsedSummary(null);
      setError(parseError instanceof Error ? parseError.message : 'MCP JSON 解析失败。');
    }
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
      if (toolNames.length === 0 && result.toolNames.length > 0) {
        setEnabledToolsText(result.toolNames.join('\n'));
      }
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!connectionRef.trim()) {
      setError('请先粘贴并解析 MCP JSON。');
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
        description="主流程就是贴 JSON、解析、测试、保存。只有遇到特殊情况时才需要展开高级选项。"
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
              <p>系统会自动提取 URL、名称、token 与工具列表；测试成功后即可保存。</p>
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
                <p className="text-xs text-muted-foreground">每行或逗号分隔一个工具名；如果测试成功且这里为空，会自动填入发现到的工具。</p>
              </div>

              <div className="space-y-2">
                <Label>运行时授权角色</Label>
                <div className="flex flex-wrap gap-3 rounded-md border p-3">
                  {(['teacher', 'student'] as RuntimeRole[]).map((role) => (
                    <label key={role} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox checked={allowedRoles.has(role)} onCheckedChange={() => toggleRole(role)} />
                      {role === 'teacher' ? '教师' : '学生'}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox checked={isEnabled} onCheckedChange={(value) => setIsEnabled(Boolean(value))} id="mcp-enabled" />
                <Label htmlFor="mcp-enabled" className="cursor-pointer">保存后立即启用此 Server</Label>
              </div>
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
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
