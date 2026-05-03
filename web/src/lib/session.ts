import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

import type { AppRole } from '@/lib/supabase/database.types';

export const CWB_SESSION_COOKIE = 'cwb_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  sub: string;
  loginId: string;
  role: AppRole;
  displayName: string;
  exp: number;
};

export type AppSession = SessionPayload;

function getAuthSecret() {
  const secret = process.env.CWB_AUTH_SECRET;
  if (!secret?.trim()) throw new Error('CWB_AUTH_SECRET is required for school-account sessions.');
  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string) {
  return createHmac('sha256', getAuthSecret()).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createDatabaseSessionSignature(userId: string) {
  return createHmac('sha256', getAuthSecret()).update(userId).digest('hex');
}

export function createSessionToken(session: Omit<SessionPayload, 'exp'>) {
  const payload: SessionPayload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseSessionToken(token?: string | null): AppSession | null {
  if (!token) return null;
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra) return null;
  if (!safeEqual(sign(encodedPayload), signature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<SessionPayload>;
    if (!payload.sub || !payload.loginId || !payload.role || !payload.displayName || !payload.exp) return null;
    if (!['admin', 'teacher', 'student'].includes(payload.role)) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as AppSession;
  } catch {
    return null;
  }
}

export async function getAppSession() {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(CWB_SESSION_COOKIE)?.value);
}

export function attachSessionCookie(response: NextResponse, session: Omit<SessionPayload, 'exp'>) {
  response.cookies.set(CWB_SESSION_COOKIE, createSessionToken(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(CWB_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
