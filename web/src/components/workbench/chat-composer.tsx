'use client';

import type { ChangeEvent, KeyboardEvent, SubmitEvent } from 'react';
import { Paperclip, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  inputDisabled?: boolean;
  placeholder: string;
  blockedReason?: string;
  submitLabel?: string;
  onFileUpload?: (file: File) => void;
  uploadDisabled?: boolean;
  uploadStatus?: string;
  uploadError?: string;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  inputDisabled = disabled,
  placeholder,
  blockedReason,
  submitLabel = '发送',
  onFileUpload,
  uploadDisabled,
  uploadStatus,
  uploadError,
}: ChatComposerProps) {
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit();
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (value.trim() && !disabled) onSubmit();
    }
  };

  const fileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file && onFileUpload && !uploadDisabled) onFileUpload(file);
  };

  return (
    <div className="space-y-3">
      {blockedReason ? (
        <Alert className="border-destructive/30 bg-destructive/8 shadow-soft backdrop-blur">
          <AlertDescription>{blockedReason}</AlertDescription>
        </Alert>
      ) : null}
      {uploadError ? (
        <Alert className="border-destructive/30 bg-destructive/8 shadow-soft backdrop-blur">
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      ) : null}
      {uploadStatus ? (
        <Alert className="border-primary/30 bg-primary/8 shadow-soft backdrop-blur">
          <AlertDescription>{uploadStatus}</AlertDescription>
        </Alert>
      ) : null}
      {/* 极简输入条：单一容器承载输入与动作，视觉重量压到最低。
          学生端/教师端共用，改这里两端同时生效。 */}
      <form onSubmit={submit} className="flex items-end gap-1 rounded-2xl border border-border/70 bg-background/85 px-2 py-1.5 backdrop-blur transition-colors focus-within:border-ring/60" aria-label="AI 会话输入区">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={keyDown}
          placeholder={placeholder}
          className="max-h-40 min-h-9 min-w-0 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
          rows={1}
          disabled={inputDisabled}
          aria-label={placeholder}
        />
        {onFileUpload ? (
          <Button type="button" variant="ghost" className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground" disabled={uploadDisabled} nativeButton={false} render={(
            <label className="cursor-pointer" aria-label="上传会话附件">
              <Paperclip className="size-4" aria-hidden="true" />
              <span className="sr-only">上传会话附件</span>
              <input type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" className="sr-only" onChange={fileChange} disabled={uploadDisabled} />
            </label>
          )} />
        ) : null}
        <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full" disabled={disabled || !value.trim()} aria-label={submitLabel}>
          <Send className="size-4" aria-hidden="true" />
          <span className="sr-only">{submitLabel}</span>
        </Button>
      </form>
      {onFileUpload ? <p className="px-2 text-xs text-muted-foreground">支持 TXT、MD、JSON，最大 512 KB。</p> : null}
    </div>
  );
}
