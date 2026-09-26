import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const serverLogStorePath = resolve(new URL('..', import.meta.url).pathname, 'observability/server-log-store.ts');
const source = readFileSync(serverLogStorePath, 'utf8');
const querySource = source.slice(
  source.indexOf('async function queryAppLogEvents'),
  source.indexOf('export async function getLogFileStatus'),
);

test('searches trace identifiers in both the request column and the json context', () => {
  // When
  const traceColumns = /query\.or\(\s*\['request_id', 'context->>trace_id', 'context->>traceId'\]/;

  // Then
  assert.match(querySource, traceColumns);
  assert.match(querySource, /query\.gte\('created_at', filters\.since\)/);
});

test('labels the file fallback channel so the UI can stop presenting it as production data', () => {
  // Then
  assert.match(source, /return \{ source: 'file', events \}/);
  assert.match(source, /return \{ source: 'database', events: result\.rows\.map\(rowToStoredEvent\) \}/);
  assert.match(source, /return \{ count: events\.length, source: 'file' \}/);
});
