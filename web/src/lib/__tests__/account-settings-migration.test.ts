import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const accountSettingsMigrationUrl = new URL(
  '../../../supabase/migrations/20260907110000_account_settings.sql',
  import.meta.url,
);

test('binds account mutations to the signed current user and rotates session versions', async () => {
  // Given
  const migration = await readFile(accountSettingsMigrationUrl, 'utf8');

  // When
  const ownsAccountMutation = /v_user_id\s+uuid\s*:=\s*public\.current_app_user_id\(\)/i.test(migration);
  const rotatesSessionVersion = /session_version\s*=\s*p\.session_version\s*\+\s*1/i.test(migration);
  const checksCurrentPassword = /extensions\.crypt\(p_current_password,\s*v_password_hash\)/i.test(migration);

  // Then
  assert.equal(ownsAccountMutation && rotatesSessionVersion && checksCurrentPassword, true);
});

test('restricts avatar persistence to the local preset keys', async () => {
  // Given
  const migration = await readFile(accountSettingsMigrationUrl, 'utf8');

  // When
  const hasAvatarConstraint = /avatar_key\s+in\s*\(\s*'ink',\s*'pine',\s*'cinnabar',\s*'moon',\s*'bamboo',\s*'plum'\s*\)/i.test(migration);

  // Then
  assert.equal(hasAvatarConstraint, true);
});

test('preserves legacy school login during the additive account migration', async () => {
  // Given
  const accountSettingsMigration = await readFile(accountSettingsMigrationUrl, 'utf8');

  // When
  const additiveMigrationRevokesLegacyLogin = /revoke all on function public\.authenticate_school_account\(text, text\) from public, anon, authenticated/i.test(accountSettingsMigration);

  // Then
  assert.equal(additiveMigrationRevokesLegacyLogin, false);
});
