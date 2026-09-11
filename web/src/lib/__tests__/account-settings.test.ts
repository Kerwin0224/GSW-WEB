import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accountPasswordSchema,
  accountRpcProfilesSchema,
  avatarKeySchema,
  resolvePasswordChangeResult,
} from '../account-settings.ts';

test('accepts a password change when all account password constraints are met', () => {
  // Given
  const input = {
    currentPassword: 'old-password',
    newPassword: 'hanwen2026x',
    confirmPassword: 'hanwen2026x',
  };

  // When
  const result = accountPasswordSchema.safeParse(input);

  // Then
  assert.equal(result.success, true);
});

test('rejects a password change when confirmation differs', () => {
  // Given
  const input = {
    currentPassword: 'old-password',
    newPassword: 'hanwen2026x',
    confirmPassword: 'hanwen2026y',
  };

  // When
  const result = accountPasswordSchema.safeParse(input);

  // Then
  assert.equal(result.success, false);
});

test('rejects a password change when the new password matches the current password', () => {
  // Given
  const input = {
    currentPassword: 'same-password',
    newPassword: 'same-password',
    confirmPassword: 'same-password',
  };

  // When
  const result = accountPasswordSchema.safeParse(input);

  // Then
  assert.equal(result.success, false);
});

test('rejects a password longer than the bcrypt byte limit', () => {
  // Given
  const password = '文'.repeat(25);

  // When
  const result = accountPasswordSchema.safeParse({
    currentPassword: 'old-password',
    newPassword: password,
    confirmPassword: password,
  });

  // Then
  assert.equal(result.success, false);
});

test('accepts a supported local avatar key', () => {
  // Given
  const avatarKey = 'pine';

  // When
  const result = avatarKeySchema.safeParse(avatarKey);

  // Then
  assert.equal(result.success, true);
});

test('rejects a remote avatar URL', () => {
  // Given
  const avatarUrl = 'https://example.com/avatar.png';

  // When
  const result = avatarKeySchema.safeParse(avatarUrl);

  // Then
  assert.equal(result.success, false);
});

test('accepts a PostgreSQL UUID without an RFC version nibble in an account RPC response', () => {
  // Given
  const data: unknown = [{
    id: 'a0000000-0000-0000-0000-000000000001',
    login_id: '20000101',
    role: 'admin',
    display_name: '管理员',
    avatar_key: 'ink',
    session_version: 2,
    must_change_password: false,
  }];

  // When
  const result = accountRpcProfilesSchema.safeParse(data);

  // Then
  assert.equal(result.success, true);
});

test('rejects a malformed identifier in an account RPC response', () => {
  // Given
  const data: unknown = [{
    id: 'not-a-uuid',
    login_id: '20000101',
    role: 'admin',
    display_name: '管理员',
    avatar_key: 'ink',
    session_version: 2,
    must_change_password: false,
  }];

  // When
  const result = accountRpcProfilesSchema.safeParse(data);

  // Then
  assert.equal(result.success, false);
});

test('maps an empty password RPC response to current-password rejection', () => {
  // Given
  const data: unknown = [];

  // When
  const result = resolvePasswordChangeResult(data, null);

  // Then
  assert.deepEqual(result, { kind: 'current-password-rejected' });
});

test('maps a password rate-limit database error to a rate-limited result', () => {
  // Given
  const error: unknown = { code: 'P0001', message: 'password_rate_limited' };

  // When
  const result = resolvePasswordChangeResult(null, error);

  // Then
  assert.deepEqual(result, { kind: 'rate-limited' });
});

test('parses a successful password RPC response into a typed account', () => {
  // Given
  const data: unknown = [{
    id: 'a0000000-0000-0000-0000-000000000001',
    login_id: '20000101',
    role: 'admin',
    display_name: '管理员',
    avatar_key: 'ink',
    session_version: 2,
    must_change_password: false,
  }];

  // When
  const result = resolvePasswordChangeResult(data, null);

  // Then
  assert.equal(result.kind, 'success');
});
