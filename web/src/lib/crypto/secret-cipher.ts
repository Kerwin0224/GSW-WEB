import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * 对称加密 Provider/MCP 等运行时密钥。
 *
 * 设计：
 * - 密钥派生：scrypt(CWB_AUTH_SECRET, "cwb-secret-cipher-v1", 32)
 * - 加密算法：AES-256-GCM
 * - 输出格式：v1.{iv-hex}.{authTag-hex}.{ciphertext-base64}
 *
 * 不直接复用 CWB_AUTH_SECRET 用于会话签名的字节流，避免跨用途同 key
 * 引发的潜在风险（NIST 推荐"一 key 一用途"）。
 */

const FORMAT_VERSION = 'v1';
const KDF_SALT = 'cwb-secret-cipher-v1';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // GCM 推荐 96 bit IV

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.CWB_AUTH_SECRET;
  if (!secret?.trim()) {
    throw new Error('CWB_AUTH_SECRET is required for provider secret encryption.');
  }
  cachedKey = scryptSync(secret, KDF_SALT, 32);
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext?.trim()) throw new Error('Cannot encrypt empty secret.');

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString('hex'),
    authTag.toString('hex'),
    ciphertext.toString('base64'),
  ].join('.');
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload || typeof payload !== 'string') return null;
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) return null;

  try {
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const ciphertext = Buffer.from(parts[3], 'base64');

    const decipher = createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * 判断字符串是否符合本工具加密产物的格式（用于鉴别旧 env: 引用与新加密值）。
 */
export function isEncryptedSecret(payload: string | null | undefined): boolean {
  if (!payload || typeof payload !== 'string') return false;
  const parts = payload.split('.');
  return parts.length === 4 && parts[0] === FORMAT_VERSION;
}
