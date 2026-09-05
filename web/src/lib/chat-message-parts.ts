import type { UIMessage } from 'ai';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isTextPart(part: unknown) {
  return isRecord(part) && part.type === 'text';
}

export function canonicalizeUiMessageParts(content: string, parts: unknown): UIMessage['parts'] {
  const nonTextParts = Array.isArray(parts) ? parts.filter((part) => !isTextPart(part)) : [];
  return [{ type: 'text', text: content }, ...nonTextParts] as UIMessage['parts'];
}
