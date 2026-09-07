import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  createDatabaseSignatureSubject,
  createSessionTokenWithSecret,
  parseSessionTokenWithSecret,
} from '../session-token.ts';

const SECRET = 'test-secret-with-enough-entropy';
const NOW_SECONDS = 1_800_000_000;

test('round-trips a versioned school account session', () => {
  // Given
  const session = {
    sub: 'a0000000-0000-0000-0000-000000000001',
    loginId: '20000101',
    role: 'admin' as const,
    displayName: '管理员',
    sessionVersion: 3,
  };

  // When
  const token = createSessionTokenWithSecret(session, SECRET, NOW_SECONDS);
  const parsed = parseSessionTokenWithSecret(token, SECRET, NOW_SECONDS);

  // Then
  assert.deepEqual(parsed, { ...session, exp: NOW_SECONDS + 60 * 60 * 8 });
});

test('parses an existing unversioned session as version zero', () => {
  // Given
  const payload = Buffer.from(JSON.stringify({
    sub: 'a0000000-0000-0000-0000-000000000001',
    loginId: '20000101',
    role: 'admin',
    displayName: '管理员',
    exp: NOW_SECONDS + 60,
  }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', SECRET).update(payload).digest('base64url');

  // When
  const parsed = parseSessionTokenWithSecret(`${payload}.${signature}`, SECRET, NOW_SECONDS);

  // Then
  assert.equal(parsed?.sessionVersion, 0);
});

test('rejects a tampered school account session', () => {
  // Given
  const token = createSessionTokenWithSecret({
    sub: 'a0000000-0000-0000-0000-000000000001',
    loginId: '20000101',
    role: 'admin',
    displayName: '管理员',
    sessionVersion: 1,
  }, SECRET, NOW_SECONDS);

  // When
  const parsed = parseSessionTokenWithSecret(`${token}x`, SECRET, NOW_SECONDS);

  // Then
  assert.equal(parsed, null);
});

test('uses the legacy database signature subject only for version zero', () => {
  // Given
  const userId = 'a0000000-0000-0000-0000-000000000001';

  // When
  const legacySubject = createDatabaseSignatureSubject(userId, 0);
  const rotatedSubject = createDatabaseSignatureSubject(userId, 4);

  // Then
  assert.equal(legacySubject, userId);
  assert.equal(rotatedSubject, `${userId}:4`);
});
