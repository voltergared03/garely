// Public (no session) endpoint for invited users to create their first password
// from the one-time link in their invitation email. The token is a NextAuth
// VerificationToken (identifier = email) minted by /api/users/invite.
// Lives under /api/auth so the middleware lets it through unauthenticated.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, passwordPolicyError } from '@/lib/password';
import { rateLimit } from '@/lib/rate-limit';
import { withRoute } from '@/lib/with-route';

function ipOf(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

// GET /api/auth/set-password?token=… — validate an invite token.
async function getHandler(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  const vt = await prisma.verificationToken.findUnique({ where: { token } }).catch(() => null);
  if (!vt || vt.expires < new Date()) return NextResponse.json({ ok: false });

  const user = await prisma.user.findUnique({
    where: { email: vt.identifier },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ ok: false });

  return NextResponse.json({ ok: true, email: vt.identifier });
}

// POST /api/auth/set-password { token, password } — set the password for an
// invited (pre-created) user, activate them, and burn the token.
async function postHandler(req: NextRequest) {
  if (!rateLimit(`set-password:${ipOf(req)}`, 20, 10 * 60_000).ok) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as any));
  const token = String(body.token || '');
  const password = String(body.password || '');

  const vt = token ? await prisma.verificationToken.findUnique({ where: { token } }).catch(() => null) : null;
  if (!vt || vt.expires < new Date()) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const pwErr = passwordPolicyError(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { email: vt.identifier },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'invalid_token' }, { status: 400 });

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, status: 'active' } as any,
  });
  // Burn this token (and any other pending ones for the same email).
  await prisma.verificationToken.deleteMany({ where: { identifier: vt.identifier } }).catch(() => {});

  return NextResponse.json({ ok: true, email: vt.identifier });
}

export const GET = withRoute('auth.set-password.get', getHandler);
export const POST = withRoute('auth.set-password.post', postHandler);
