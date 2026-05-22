import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side auth middleware for client cabinet.
 * Protects all pages except /login and /auth/verify.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes
  const publicPaths = ['/login', '/register', '/auth', '/wheel', '/api', '/_next', '/favicon.ico', '/icon-', '/manifest.json', '/sw.js'];
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for auth token in cookie
  const token = request.cookies.get('customer_token')?.value;

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Basic JWT expiry check
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp * 1000 < Date.now()) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      const response = NextResponse.redirect(url);
      response.cookies.delete('customer_token');
      return response;
    }
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const response = NextResponse.redirect(url);
    response.cookies.delete('customer_token');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-|manifest.json|sw.js).*)'],
};
