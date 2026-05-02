import { jwtVerify } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';

// Fixed 32-byte key — avoids TextEncoder/env encoding issues in proxy
const JWT_SECRET = new Uint8Array([
  0xef, 0xe9, 0x0a, 0x5b, 0x14, 0xc8, 0x9a, 0x1b,
  0x31, 0x54, 0xef, 0x36, 0xb1, 0xa7, 0xc4, 0x04,
  0x74, 0x3e, 0xa7, 0x0d, 0x81, 0x91, 0x71, 0x51,
  0x06, 0xb6, 0xf8, 0xef, 0x22, 0xf7, 0x0d, 0x25,
]);

const publicPaths = ['/login', '/auth/callback', '/api/auth'];

function isPublic(pathname: string) {
  return publicPaths.some((p) => pathname.startsWith(p));
}

const roleHome: Record<string, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
};

interface JwtPayload {
  sub: string;
  role: string;
}

const isKnownRole = (role: string): role is keyof typeof roleHome => role in roleHome;

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('cwb_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const jwt = payload as unknown as JwtPayload;

    const response = NextResponse.next();
    response.headers.set('X-User-Id', jwt.sub);
    response.headers.set('X-User-Role', jwt.role);

    if (pathname === '/') {
      if (!isKnownRole(jwt.role)) {
        const invalidRoleResponse = NextResponse.redirect(new URL('/login?error=role_required', request.url));
        invalidRoleResponse.cookies.delete('cwb_token');
        return invalidRoleResponse;
      }

      return NextResponse.redirect(new URL(roleHome[jwt.role], request.url));
    }

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[proxy] JWT verify failed:', message, 'secret-length:', JWT_SECRET.length);
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('cwb_token');
    return response;
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
