import { NextResponse, type NextRequest } from 'next/server';

import { CWB_SESSION_COOKIE, parseSessionToken } from '@/lib/session';

const publicPaths = ['/login', '/api/auth'];
const roleHome = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
} as const;

type AppRole = keyof typeof roleHome;

function isPublic(pathname: string) {
  return publicPaths.some((path) => pathname.startsWith(path));
}

function matchRequiredRole(pathname: string): AppRole | null {
  const entry = Object.entries(roleHome).find(([, home]) => pathname.startsWith(home));
  return entry ? (entry[0] as AppRole) : null;
}

// Next.js 16 renamed middleware.ts to proxy.ts. Auth in proxy is coarse-grained:
// we only confirm the session cookie is a valid, signed app session and that its
// role matches the requested role home. All row-level checks still happen at the
// page / route handler / RLS level via getAppSession() and RLS policies.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next({ request });

  const sessionToken = request.cookies.get(CWB_SESSION_COOKIE)?.value;
  const session = parseSessionToken(sessionToken);
  if (!session) return NextResponse.redirect(new URL('/login', request.url));

  const requiredRole = matchRequiredRole(pathname);
  if (requiredRole && session.role !== requiredRole) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
