import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CWB_SESSION_COOKIE = 'cwb_session';

/**
 * 提取 session token 中的 role 字段（Edge Runtime 兼容）
 *
 * Session token 格式：`{base64url-payload}.{signature}`（2 段，非标准 JWT）
 * 详见 web/src/lib/session.ts 的 createSessionToken 实现
 *
 * 注意：middleware 不验证 signature（需要 Node.js crypto），
 * 仅做"有 role 字段就放行"的轻量级路由保护；
 * 真正的 signature 验证在 API Route 和 Server Component 中通过
 * getAppSession() / requireRole() 完成。
 */
function extractRoleFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const encodedPayload = parts[0];
    if (!encodedPayload) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

    // 检查过期时间
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get session token
  const sessionToken = request.cookies.get(CWB_SESSION_COOKIE)?.value;
  const role = sessionToken ? extractRoleFromToken(sessionToken) : null;

  // Role-based route protection
  if (pathname.startsWith('/student')) {
    if (!role) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (role !== 'student') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  if (pathname.startsWith('/teacher')) {
    if (!role) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (role !== 'teacher') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  if (pathname.startsWith('/admin')) {
    if (!role) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)',
  ],
};
