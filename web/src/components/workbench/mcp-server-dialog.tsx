'use client';

import { useState, useTransition } from 'react';
import { Loader2, Pencil, Plus, Puzzle, Trash2, XCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogCancelButton, AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { createMcpServer, deleteMcpServer, updateMcpServer, type AppRoleArray } from '@/lib/data/admin';
import type { Json } from '@/lib/supabase/database.types';

type RuntimeRole = 'teacher' | 'student';
type StoredRole = 'admin' | RuntimeRole;

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
  enabledTools: unknown[];
  metadata: Json;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseMcpJson(jsonText: string): ParsedMcpConfig {
  const parsed = JSON.parse(jsonText) as unknown;
  const root = asRecord(parsed);
  if (!root) throw new Error('MCP JSON 必须是对象。');

  const servers = asRecord(root.mcpServers) ?? asRecord(root.servers);
  let name = typeof root.name === 'string' ? root.name : '';
  let entry = root;

  if (servers) {
    const first = Object.entries(servers).find(([, value]) => Boolean(asRecord(value)));
    if (!first) throw new Error('mcpServers 中没有可导入的 Server。');
    name = first[0];
    entry = asRecord(first[1]) ?? {};
  }

  const url = typeof entry.url === 'string' ? entry.url.trim() : '';
  const command = typeof entry.command === 'string' ? entry.command.trim() : '';
  const args = Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === 'string') : [];
  const connectionRef = url || (command ? `stdio:${[command, ...args].join(' ')}` : '');
  if (!connectionRef) throw new Error('MCP JSON 需要提供 url，或 command/args。');

  const rawTools = entry.enabledTools ?? entry.enabled_tools ?? entry.tools ?? [];
  const enabledTools = Array.isArray(rawTools) ? rawTools : [];

  return {
    name: name || '未命名 MCP Server',
    description: typeof entry.description === 'string' ? entry.description : '',
    connectionRef,
    enabledTools,
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
  const [enabledToolsText, setEnabledToolsText] = useState(
    initial?.enabledTools ? JSON.stringify(initial.enabledTools, null, 2) : '[]'
  );
  const [allowedRoles, setAllowedRoles] = useState<Set<RuntimeRole>>(new Set((initial?.allowedRoles ?? []).filter((role): role is RuntimeRole => role === 'teacher' || role === 'student')));
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function applyJson() {
    setError(null);
    try {
      const parsed = parseMcpJson(jsonText);
      setName(parsed.name);
      setDescription(parsed.description);
      setConnectionRef(parsed.connectionRef);
      setEnabledToolsText(JSON.stringify(parsed.enabledTools, null, 2));
      setMetadata(parsed.metadata);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'MCP JSON 解析失败。');
    }
  }

  function toggleRole(role: RuntimeRole) {
    const next = new Set(allowedRoles);
    if (next.has(role)) next.delete(role); else next.add(role);
    setAllowedRoles(next);
  }

  async function handleSubmit() {
    setError(null);
    if (!connectionRef.trim()) {
      setError('请先粘贴并解析 MCP JSON，或填写连接引用。');
      return;
    }

    let parsedTools: unknown = [];
    try {
      parsedTools = enabledToolsText.trim() ? JSON.parse(enabledToolsText) : [];
    } catch {
      setError('启用工具必须是合法 JSON。');
      return;
    }

    const input: Parameters<typeof createMcpServer>[0] = {
      name,
      description,
      connectionRef,
      enabledTools: parsedTools,
      allowedRoles: Array.from(allowedRoles) as AppRoleArray,
      metadata,
      isEnabled,
    };
    if (token.trim()) input.token = token.trim();

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
    if (!initial?.id) return;

    startTransition(async () => {
      const result = await deleteMcpServer(initial.id!);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setConfirmDeleteOpen(false);
    });
  }

  const trigger = mode === 'edit' ? (
    <Button type="button" variant="ghost" size="icon-sm" title="编辑 MCP Server">
      <Pencil className="size-3.5" />
    </Button>
  ) : (
    <Button type="button">
      <Plus className="mr-2 size-4" />添加 MCP Server
    </Button>
  );

  return (
    <>
      <AdminDialogShell
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        title={mode === 'edit' ? '编辑 MCP Server' : '粘贴 JSON 添加 MCP Server'}
        description="管理员只配置 MCP 能力，不作为 AI 对话工具使用者。运行时授权仅开放给教师或学生。"
        icon={<Puzzle className="size-5" />}
        className="max-w-2xl"
        footer={(
          <div className="flex w-full justify-between gap-2">
            {mode === 'edit' && initial?.id ? (
              <Button type="button" variant="destructive" onClick={() => setConfirmDeleteOpen(true)} disabled={submitting}>
                <Trash2 className="mr-1 size-4" />删除
              </Button>
            ) : <span />}
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-json">MCP JSON 配置</Label>
            <Textarea
              id="mcp-json"
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              placeholder={'{\n  "mcpServers": {\n    "poetry": { "url": "https://mcp.example.com/sse" }\n  }\n}'}
              rows={6}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={applyJson} disabled={!jsonText.trim()}>
              解析 JSON 并填入下方字段
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mcp-name">显示名称</Label>
              <Input id="mcp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="导入后可改名" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-description">说明</Label>
              <Input id="mcp-description" value={description ?? ''} onChange={(event) => setDescription(event.target.value)} placeholder="对该 Server 的简短说明" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-connection">连接引用</Label>
            <Input id="mcp-connection" value={connectionRef ?? ''} onChange={(event) => setConnectionRef(event.target.value)} placeholder="https://mcp.example.com/sse 或 stdio:command" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-token">API Token / 密钥（可选）</Label>
            <Input
              id="mcp-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={mode === 'edit' && initial?.secretLastFour ? `已保存（末四位 ${initial.secretLastFour}），留空保持不变` : '直接粘贴 token，留空表示无需认证'}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">服务端会加密保存，不以明文落库。</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-tools">启用工具（JSON 数组）</Label>
            <Textarea id="mcp-tools" value={enabledToolsText} onChange={(event) => setEnabledToolsText(event.target.value)} rows={3} className="font-mono text-xs" />
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
            <p className="text-xs text-muted-foreground">管理员只维护配置，不授权为 AI 对话中的工具调用角色。</p>
          </div>

          <div className="flex items-center gap-2 rounded-md border p-3">
            <Checkbox checked={isEnabled} onCheckedChange={(value) => setIsEnabled(Boolean(value))} id="mcp-enabled" />
            <Label htmlFor="mcp-enabled" className="cursor-pointer">立即启用此 Server</Label>
          </div>

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
          trigger={<span className="hidden" />}
          title={`删除 MCP Server「${name || '未命名'}」`}
          description="删除后该 Server 授权角色将失去对应工具入口。"
          icon={<Trash2 className="size-5" />}
          className="max-w-md"
          footer={(
            <>
              <AdminDialogCancelButton onClick={() => setConfirmDeleteOpen(false)} />
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={submitting}>
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
