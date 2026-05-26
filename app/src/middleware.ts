import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { verifyTwoFactorCookieEdge } from '@/lib/twofactor-edge';
import { authSecret } from '@/lib/secret';

const SECRET = authSecret() || undefined;

/**
 * Enforces 2FA across the surfaces the (app)/layout gate can't reach:
 * all /api/* routes plus the /room, /lobby, /join pages. The layout still
 * handles the (app) pages (with DB-truth) and forced enrollment.
 *
 * Fail-open by design: if there's no session (or token can't be read), we let
 * the request through — the route handlers still enforce authentication. We
 * only ever ADD the 2FA requirement for users who actually enabled it.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never gate the auth + 2FA endpoints themselves (would deadlock the unlock flow).
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/2fa')) {
    return NextResponse.next();
  }

  let token: any = null;
  try {
    const secure = req.cookies.has('__Secure-authjs.session-token');
    const cookieName = secure ? '__Secure-authjs.session-token' : 'authjs.session-token';
    token = await getToken({ req, secret: SECRET, secureCookie: secure, cookieName });
  } catch {
    return NextResponse.next(); // can't read token → let routes handle auth
  }

  // No session, or this user hasn't enabled 2FA → nothing to enforce here.
  if (!token || !token.totpEnabled) return NextResponse.next();

  const userId = String(token.id || token.sub || '');
  const passed = await verifyTwoFactorCookieEdge(req.cookies.get('eam_2fa')?.value, userId);
  if (passed) return NextResponse.next();

  // 2FA is enabled but not verified for this session.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: '2FA verification required', code: 'TWO_FACTOR_REQUIRED' },
      { status: 403 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/2fa';
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/api/:path*', '/room/:path*', '/lobby/:path*', '/join/:path*'],
};
