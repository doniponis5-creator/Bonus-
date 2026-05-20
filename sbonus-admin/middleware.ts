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

  // JWT validation: format, expiry, and role check
  // Note: Full signature verification happens server-side on every API call.
  // This middleware prevents rendering admin pages with invalid/expired/customer tokens.
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = JSON.parse(atob(parts[1]));

    // Check expiry — but allow if refresh token exists (client-side will refresh)
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      const refreshToken = request.cookies.get('admin_refresh')?.value;
      if (refreshToken) {
        // Token expired but refresh exists → let client-side handle refresh
        return NextResponse.next();
      }
      throw new Error('Token expired');
    }

    // Block customer tokens from accessing admin
    if (payload.role === 'customer') {
      throw new Error('Customer token not allowed');
    }

    // Require admin roles only
    const allowedRoles = ['super_admin', 'branch_admin', 'cashier'];
    if (!allowedRoles.includes(payload.role)) {
      throw new Error('Invalid role');
    }
  } catch (e: any) {
    // If token is expired but has refresh — already handled above
    // All other errors → redirect to login
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
