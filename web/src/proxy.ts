import { NextResponse, type NextRequest } from 'next/server';

import { ROLE_HOME } from '@/lib/role-home';
import { CWB_SESSION_COOKIE, parseSessionToken } from '@/lib/session';
// 必须 import type：proxy 跑在 Edge runtime，值导入会把 database.types.ts 拖进 edge bundle。
import type { AppRole } from '@/lib/supabase/database.types';

const publicPaths = ['/login', '/api/auth'];

function isPublic(pathname: string) {
  return publicPaths.some((path) => pathname.startsWith(path));
}

function matchRequiredRole(pathname: string): AppRole | null {
  // 此前这里是 `type AppRole = keyof typeof roleHome` + 本地那份 roleHome：类型被收窄回自己的表，
  // 永远不会和 APP_ROLES 比对，新角色拿不到守卫。现在键来自 ROLE_HOME，穷尽性由它保证。
  const entry = Object.entries(ROLE_HOME).find(([, home]) => pathname.startsWith(home));
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

  // 强制首登改密：初始密码=学号/工号的账号在改密前只能访问 /settings。
  // API 侧由 requireRole 同步拦截（改密路由不走 requireRole，天然放行）。
  if (session.mustChangePassword && pathname !== '/settings') {
    return NextResponse.redirect(new URL('/settings?required=1', request.url));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
