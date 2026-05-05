'use client';

import { useState, useTransition, type ReactElement } from 'react';
import { Loader2, XCircle, Puzzle, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { AdminDialogShell, AdminDialogCancelButton } from '@/components/workbench/admin-dialog-shell';
import { createMcpServer, updateMcpServer, deleteMcpServer, type AppRoleArray } from '@/lib/data/admin';

type Role = 'admin' | 'teacher' | 'student';

export type McpServerInitialData = {
  id?: string;
  name?: string;
  description?: string | null;
  connectionRef?: string | null;
  secretLastFour?: string | null;
  enabledTools?: unknown;
  allowedRoles?: Role[];
  isEnabled?: boolean;
};

export function McpServerDialog({
  trigger,
  initial,
  mode = 'create',
}: {
  trigger: ReactElement;
  initial?: McpServerInitialData;
  mode?: 'create' | 'edit';
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [connectionRef, setConnectionRef] = useState(initial?.connectionRef ?? '');
  const [token, setToken] = useState('');
  const [enabledToolsText, setEnabledToolsText] = useState(
    initial?.enabledTools ? JSON.stringify(initial.enabledTools, null, 2) : '[]'
  );
  const [allowedRoles, setAllowedRoles] = useState<Set<Role>>(new Set(initial?.allowedRoles ?? []));
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: Role) {
    const next = new Set(allowedRoles);
    if (next.has(role)) next.delete(role); else next.add(role);
    setAllowedRoles(next);
  }

  async function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError('请提供 Server 名称');
      return;
    }

    let parsedTools: unknown = [];
    try {
      parsedTools = enabledToolsText.trim() ? JSON.parse(enabledToolsText) : [];
    } catch {
      setError('启用工具必须是合法 JSON');
      return;
    }

    const input: Parameters<typeof createMcpServer>[0] = {
      name,
      description,
      connectionRef,
      enabledTools: parsedTools,
      allowedRoles: Array.from(allowedRoles) as AppRoleArray,
      isEnabled,
    };

    // 只有在用户输入了新 token 时才传 token；编辑模式下留空表示保持原值
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

  return (
    <>
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={mode === 'edit' ? '编辑 MCP Server' : '添加 MCP Server'}
      description="MCP Server 通过引用挂载外部工具能力。token 与命令行参数等敏感数据需放进服务端 env，这里只登记引用。"
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
            <Label htmlFor="mcp-name">名称</Label>
            <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：古诗文知识库" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-description">说明</Label>
            <Input id="mcp-description" value={description ?? ''} onChange={(e) => setDescription(e.target.value)} placeholder="对该 Server 提供能力的简短描述" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-connection">连接引用</Label>
            <Input
              id="mcp-connection"
              value={connectionRef ?? ''}
              onChange={(e) => setConnectionRef(e.target.value)}
              placeholder="https://mcp.example.com/sse 或 stdio:command"
            />
            <p className="text-xs text-muted-foreground">
              支持 http(s) URL 直连，或 stdio:command 形式调用本地命令。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-token">API Token / 密钥（可选）</Label>
            <Input
              id="mcp-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                mode === 'edit' && initial?.secretLastFour
                  ? `已保存（末四位 ${initial.secretLastFour}），留空保持不变`
                  : '直接粘贴 token，留空表示无需认证'
              }
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              服务端会用 AES-256-GCM 加密保存，不以明文落库。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-tools">启用工具（JSON 数组）</Label>
            <Textarea
              id="mcp-tools"
              value={enabledToolsText}
              onChange={(e) => setEnabledToolsText(e.target.value)}
              placeholder='["search_poem", "get_translation"]'
              rows={3}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              留空或 [] 表示不启用任何工具。未在此列表中的工具默认禁用。
            </p>
          </div>

          <div className="space-y-2">
            <Label>授权角色</Label>
            <div className="flex flex-wrap gap-3 rounded-md border p-3">
              {(['admin', 'teacher', 'student'] as Role[]).map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={allowedRoles.has(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  {role === 'admin' ? '管理员' : role === 'teacher' ? '教师' : '学生'}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">未选中的角色不会获得任何工具能力。</p>
          </div>

          <div className="flex items-center gap-2 rounded-md border p-3">
            <Checkbox checked={isEnabled} onCheckedChange={(v) => setIsEnabled(!!v)} id="mcp-enabled" />
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
