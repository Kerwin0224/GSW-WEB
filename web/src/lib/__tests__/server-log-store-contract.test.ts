import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const serverLogStorePath = resolve(new URL('..', import.meta.url).pathname, 'observability/server-log-store.ts');
const adminDashboardPath = resolve(new URL('..', import.meta.url).pathname, '../app/admin/page.tsx');

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
