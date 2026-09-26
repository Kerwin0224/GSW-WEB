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

test('writes tenant and duration through the trailing RPC parameters only', () => {
  // Given：旧签名是 12 个位置参数，所有调用点都按位置传。
  const insertSource = source.slice(
    source.indexOf('async function insertLogEventRow'),
    source.indexOf('export type StoredLogEvent'),
  );

  // When
  const keys = [...insertSource.matchAll(/^\s{6}(p_[a-z_]+):/gm)].map((match) => match[1]);

  // Then：前 12 个顺序不能动，新增的三个只能追加在末尾。
  // 顺序一改，school_id 会收到 p_event_id，症状是「日志全丢」而不是报错。
  assert.deepEqual(keys, [
    'p_event_id', 'p_level', 'p_area', 'p_event', 'p_route', 'p_method',
    'p_status', 'p_request_id', 'p_message', 'p_digest', 'p_context', 'p_server_signature',
    'p_school_id', 'p_organization_id', 'p_duration_ms',
  ]);
  assert.match(insertSource, /p_duration_ms: entry\.durationMs \?\? null/);
  assert.match(insertSource, /const tenant = await resolveLogTenant\(\)/);
});

test('reads back the tenant and duration columns the writer fills', () => {
  // Given
  const select = querySource.match(/\.select\('([^']+)'/)?.[1] ?? '';

  // Then
  for (const column of ['school_id', 'organization_id', 'duration_ms']) {
    assert.ok(select.split(',').includes(column), `读取列缺少 ${column}`);
  }
  assert.match(querySource, /query\.eq\('school_id', filters\.schoolId\)/);
});
