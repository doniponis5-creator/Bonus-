import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side auth middleware for admin panel.
 * Prevents unauthenticated access to dashboard pages before any rendering.
 * Checks for admin_token cookie (or falls back to checking referer for client-side auth).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth required
  const publicPaths = ['/login', '/api', '/_next', '/favicon.ico', '/icon-', '/manifest.json'];
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for auth token in cookie
  const token = request.cookies.get('admin_token')?.value;

  if (!token) {
    // Fallback: check localStorage-based auth via custom header (for backward compatibility)
    // Client-side JS sets this cookie on login — if missing, redirect to login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Basic JWT expiry check (without signature verification — that's backend's job)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp * 1000 < Date.now()) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      const response = NextResponse.redirect(url);
      response.cookies.delete('admin_token');
      return response;
    }
    // Block customer tokens from accessing admin
    if (payload.role === 'customer') {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      const response = NextResponse.redirect(url);
      response.cookies.delete('admin_token');
      return response;
    }
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const response = NextResponse.redirect(url);
    response.cookies.delete('admin_token');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-|manifest.json).*)'],
};
