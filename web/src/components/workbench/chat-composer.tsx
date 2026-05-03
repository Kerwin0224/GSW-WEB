'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder: string;
  blockedReason?: string;
  submitLabel?: string;
}

export function ChatComposer({ value, onChange, onSubmit, disabled, placeholder, blockedReason, submitLabel = '发送' }: ChatComposerProps) {
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

  return (
    <div className="space-y-3">
      {blockedReason ? (
        <Alert className="border-destructive/30 bg-destructive/5">
          <AlertDescription>{blockedReason}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={submit} className="flex gap-3" aria-label="AI 对话输入区">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={keyDown}
        placeholder={placeholder}
        className="min-h-14 resize-none bg-background"
        rows={2}
        disabled={disabled}
        aria-label={placeholder}
      />
      <Button type="submit" className="h-14 shrink-0" disabled={disabled || !value.trim()} aria-label={submitLabel}>
        <Send className="size-4" aria-hidden="true" />
        <span className="sr-only">{submitLabel}</span>
      </Button>
      </form>
    </div>
  );
}
