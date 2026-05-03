import { NextResponse, type NextRequest } from 'next/server';

const sessionCookieName = 'cwb_session';
const publicPaths = ['/login', '/api/auth'];

function isPublic(pathname: string) {
  return publicPaths.some((path) => pathname.startsWith(path));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next({ request });

  if (!request.cookies.get(sessionCookieName)?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
