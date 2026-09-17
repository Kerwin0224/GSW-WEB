import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// 用相对路径而非 @/ 别名：这行现在是值导入（原先只有类型导入会被 strip 掉），
// npm test 直接跑 node --experimental-strip-types，别名在那里无法解析。
import { APP_ROLES, type AppRole } from './supabase/database.types.ts';

export const SESSION_TTL_SECONDS = 60 * 60 * 8;

const sessionTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  loginId: z.string().min(1),
  // 必须从 APP_ROLES 派生：这里曾手抄一份三成员枚举，漏掉 org_admin，导致公司级管理员登录后
  // cookie 解析成 null、被 proxy 静默弹回 /login（TypeScript 抓不到，SessionPayload.role 是含
  // org_admin 的 AppRole，只有运行时 schema 少了它）。
  role: z.enum(APP_ROLES),
  displayName: z.string().min(1),
  sessionVersion: z.number().int().nonnegative().default(0),
  mustChangePassword: z.boolean().default(false),
  exp: z.number().int().positive(),
});

export type SessionPayload = {
  sub: string;
  loginId: string;
  role: AppRole;
  displayName: string;
  sessionVersion: number;
  /** 初始密码=学号/工号的账号在首登改密前为 true，proxy 据此全站拦截到 /settings。 */
  mustChangePassword: boolean;
  exp: number;
};

export type SessionClaims = Omit<SessionPayload, 'exp'>;

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createDatabaseSignatureSubject(userId: string, sessionVersion: number) {
  return sessionVersion === 0 ? userId : `${userId}:${sessionVersion}`;
}

export function createSessionTokenWithSecret(
  session: SessionClaims,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload: SessionPayload = {
    ...session,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function parseSessionTokenWithSecret(
  token: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token) return null;

  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra) return null;
  if (!safeEqual(sign(encodedPayload, secret), signature)) return null;

  try {
    const parsed = sessionTokenPayloadSchema.safeParse(
      JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')),
    );
    if (!parsed.success || parsed.data.exp < nowSeconds) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
