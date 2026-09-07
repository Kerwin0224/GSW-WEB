import 'server-only';

import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

import {
  createDatabaseSignatureSubject,
  createSessionTokenWithSecret,
  parseSessionTokenWithSecret,
  SESSION_TTL_SECONDS,
  type SessionClaims,
  type SessionPayload,
} from '@/lib/session-token';

export const CWB_SESSION_COOKIE = 'cwb_session';

export type AppSession = SessionPayload;

function getAuthSecret() {
  const secret = process.env.CWB_AUTH_SECRET;
  if (!secret?.trim()) throw new Error('CWB_AUTH_SECRET is required for school-account sessions.');
  return secret;
}

export function createDatabaseSessionSignature(userId: string, sessionVersion = 0) {
  const subject = createDatabaseSignatureSubject(userId, sessionVersion);
  return createHmac('sha256', getAuthSecret()).update(subject).digest('hex');
}

export function createSessionToken(session: SessionClaims) {
  return createSessionTokenWithSecret(session, getAuthSecret());
}

export function parseSessionToken(token?: string | null): AppSession | null {
  return parseSessionTokenWithSecret(token, getAuthSecret());
}

export async function getAppSession() {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(CWB_SESSION_COOKIE)?.value);
}

export function attachSessionCookie(response: NextResponse, session: SessionClaims) {
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
