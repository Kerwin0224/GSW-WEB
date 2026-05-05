'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus, ServerCog, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { saveProviderConfigV2 } from '@/lib/data/admin';

/**
 * 单一职责：只负责创建一个 Provider。
 * 测速、拉取模型、配置能力、编辑、删除都在列表行的独立按钮里完成。
 */
export function ProviderConfigDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');

  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setProviderType('openai-compatible');
    setBaseUrl('https://api.openai.com/v1');
    setApiKey('');
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveProviderConfigV2({ name, providerType, baseUrl, apiKey });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <AdminDialogShell
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
      trigger={(
        <Button type="button">
          <Plus className="mr-2 size-4" />添加 Provider
        </Button>
      )}
      title="添加 Provider"
      description="只填基础信息。保存后可在列表中独立执行：测速、拉取模型、配置能力。"
      icon={<ServerCog className="size-5" />}
      className="max-w-lg"
      footer={(
        <Button type="button" disabled={submitting || !name || !baseUrl || !apiKey} onClick={submit}>
          {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存'}
        </Button>
      )}
    >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider-name">名称</Label>
            <Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：OpenAI 官方、DeepSeek、学校网关" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-type">类型</Label>
            <Select value={providerType} onValueChange={(v) => {
              const nextType = v ?? 'openai-compatible';
              setProviderType(nextType);
              if (nextType === 'local-lmstudio') {
                setName((current) => current || 'LM Studio 本机');
                setBaseUrl('http://localhost:1234/v1');
                setApiKey((current) => current || 'lm-studio');
              }
            }}>
              <SelectTrigger id="provider-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local-lmstudio">LM Studio 本机（OpenAI Compatible）</SelectItem>
                <SelectItem value="cloud">Cloud（云端 OpenAI 兼容）</SelectItem>
                <SelectItem value="local">Local（本地部署）</SelectItem>
                <SelectItem value="proxy">Proxy（API 中转）</SelectItem>
                <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
                <SelectItem value="openai">OpenAI 官方</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="azure">Azure OpenAI</SelectItem>
                <SelectItem value="gateway">Gateway</SelectItem>
              </SelectContent>
            </Select>
          </div>

            <p className="text-xs text-muted-foreground">
              本机 LM Studio 已核实可用地址：http://localhost:1234/v1；embedding 模型候选：text-embedding-embeddinggemma-300m、text-embedding-nomic-embed-text-v1.5。
            </p>

          <div className="space-y-2">
            <Label htmlFor="provider-baseurl">Base URL</Label>
            <Input id="provider-baseurl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-apikey">API Key</Label>
            <Input id="provider-apikey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." autoComplete="off" />
            <p className="text-xs text-muted-foreground">服务端会用 AES-256-GCM 加密保存，前端永远拿不到明文。</p>
          </div>

          {error ? (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
    </AdminDialogShell>
  );
}
