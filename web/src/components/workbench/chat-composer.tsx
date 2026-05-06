'use client';

import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
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
  const submit = (event: FormEvent) => {
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
      <form onSubmit={submit} className="rounded-lg border border-primary/18 bg-background/82 p-2 shadow-soft backdrop-blur" aria-label="AI 会话输入区">
        <div className="flex min-w-0 flex-1 items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={keyDown}
          placeholder={placeholder}
          className="min-h-14 min-w-0 resize-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
          rows={2}
          disabled={inputDisabled}
          aria-label={placeholder}
        />
        {onFileUpload ? (
          <Button type="button" variant="outline" className="h-14 shrink-0 rounded-md bg-background/70" disabled={uploadDisabled} nativeButton={false} render={(
            <label className="cursor-pointer" aria-label="上传会话附件">
              <Paperclip className="size-4" aria-hidden="true" />
              <span className="sr-only">上传会话附件</span>
              <input type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" className="sr-only" onChange={fileChange} disabled={uploadDisabled} />
            </label>
          )} />
        ) : null}
        <Button type="submit" className="h-14 shrink-0 rounded-md shadow-ink" disabled={disabled || !value.trim()} aria-label={submitLabel}>
          <Send className="size-4" aria-hidden="true" />
          <span className="sr-only">{submitLabel}</span>
        </Button>
      </div>
      </form>
    </div>
  );
}
