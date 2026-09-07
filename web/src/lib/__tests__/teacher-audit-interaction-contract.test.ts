import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const teacherAuditClientPath = resolve(new URL('..', import.meta.url).pathname, '../components/workbench/teacher-audit-client.tsx');

test('remounts the finalization form when the selected conversation changes', () => {
  const source = readFileSync(teacherAuditClientPath, 'utf8');

  const invocation = source.match(/<FinalizeConversationForm[^>]+>/)?.[0] ?? '';

  assert.match(invocation, /key=\{selected\.conversationId\}/);
});
