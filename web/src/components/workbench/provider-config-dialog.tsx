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
import { PROVIDER_PROTOCOLS, PROVIDER_PROTOCOL_LABELS, DEFAULT_BASE_URLS, BASE_URL_PLACEHOLDERS, toProviderProtocol, type ProviderProtocol } from '@/lib/provider-protocol';

/**
 * 单一职责：只负责创建一个 Provider。
 * 测速、拉取模型、配置能力、编辑、删除都在列表行的独立按钮里完成。
 */
export function ProviderConfigDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<ProviderProtocol>('openai-compatible');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URLS['openai-compatible']);
  const [apiKey, setApiKey] = useState('');

  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setProviderType('openai-compatible');
    setBaseUrl(DEFAULT_BASE_URLS['openai-compatible']);
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
      description="注册一个 AI 运维 Provider。保存后在列表中独立执行健康检查、模型拉取与场景路由绑定。"
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
            <Label htmlFor="provider-type">协议</Label>
            <Select
              value={providerType}
              items={PROVIDER_PROTOCOLS.map((protocol) => ({ value: protocol, label: PROVIDER_PROTOCOL_LABELS[protocol] }))}
              onValueChange={(v) => {
                const nextType = toProviderProtocol(v);
                setProviderType(nextType);
                if (Object.values(DEFAULT_BASE_URLS).includes(baseUrl)) setBaseUrl(DEFAULT_BASE_URLS[nextType]);
              }}
            >
              <SelectTrigger id="provider-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDER_PROTOCOLS.map((protocol) => (
                  <SelectItem key={protocol} value={protocol}>{PROVIDER_PROTOCOL_LABELS[protocol]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              部署位置不是协议：DeepSeek / 学校网关 / Ollama / LM Studio 等一切 OpenAI 兼容端点都选 OpenAI Compatible，填各自地址即可（如 Ollama：http://localhost:11434/v1）。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-baseurl">Base URL</Label>
            <Input id="provider-baseurl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={BASE_URL_PLACEHOLDERS[providerType]} />
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
