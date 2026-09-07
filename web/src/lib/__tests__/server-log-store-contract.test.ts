import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const serverLogStorePath = resolve(new URL('..', import.meta.url).pathname, 'observability/server-log-store.ts');
const adminDashboardPath = resolve(new URL('..', import.meta.url).pathname, '../app/admin/page.tsx');
const migrationDirectory = new URL('../../../supabase/migrations/', import.meta.url);

test('persists authentication-boundary logs through a one-time server-signed RPC', () => {
  // Given
  const source = readFileSync(serverLogStorePath, 'utf8');
  const insertStart = source.indexOf('async function insertLogEventRow');
  const insertEnd = source.indexOf('export type StoredLogEvent');
  const insertSource = source.slice(insertStart, insertEnd);
  const migrations = readdirSync(migrationDirectory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .map((fileName) => readFileSync(new URL(fileName, migrationDirectory), 'utf8'))
    .join('\n');

  // When
  const usesSignedWriter = insertSource.includes("rpc('write_app_log_event'")
    && insertSource.includes('createDatabaseSessionSignature(`log:${eventId}`)');
  const preventsSignatureReplay = /alter\s+table\s+public\.app_log_events[\s\S]*primary\s+key\s*\(\s*id\s*\)/i.test(migrations)
    && /insert\s+into\s+public\.app_log_events\s*\(\s*id,/i.test(migrations)
    && /p_server_signature\s*=\s*\(\s*select\s+encode\s*\(\s*extensions\.hmac\s*\(\s*\('log:'\s*\|\|\s*p_event_id::text\)::bytea/i.test(migrations);
  const hasRestrictedDefiner = /write_app_log_event[\s\S]*security\s+definer[\s\S]*set\s+search_path\s+to\s+''/i.test(migrations)
    && /revoke\s+all\s+on\s+function\s+public\.write_app_log_event[\s\S]*from\s+public,\s*authenticated/i.test(migrations)
    && /grant\s+execute\s+on\s+function\s+public\.write_app_log_event[\s\S]*to\s+anon,\s*service_role/i.test(migrations);

  // Then
  assert.equal(usesSignedWriter && preventsSignatureReplay && hasRestrictedDefiner, true);
});

test('surfaces a log read failure when both persistence channels are unavailable', () => {
  const source = readFileSync(serverLogStorePath, 'utf8');
  const readStart = source.indexOf('export async function readRecentAppEvents');
  const readEnd = source.indexOf('export async function readFilteredAppEvents');

  const readRecentSource = source.slice(readStart, readEnd);

  assert.match(readRecentSource, /throw new AppLogReadError/);
});

test('keeps the admin dashboard available when runtime logs cannot be read', () => {
  const source = readFileSync(adminDashboardPath, 'utf8');

  const handlesKnownFailure = source.includes('error instanceof AppLogReadError');

  assert.equal(handlesKnownFailure, true);
});
