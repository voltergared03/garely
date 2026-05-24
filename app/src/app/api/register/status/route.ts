import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function ipOf(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

// POST /api/register/status { email, password }
// After a failed credentials login, tells the applicant whether they have a
// self-registration request that is pending / expired / denied — so the login
// screen can show a helpful message instead of a generic "wrong password"
// (a pending applicant has no User row yet, so authorize() always fails).
//
// Password-gated: the status is only revealed to someone who knows the password
// set at registration, so it can't be used to enumerate pending sign-ups.
export async function POST(req: NextRequest) {
  if (!rateLimit(`regstatus:${ipOf(req)}`, 10, 10 * 60_000).ok) {
    return NextResponse.json({ status: 'none' });
  }

  const body = await req.json().catch(() => ({} as any));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return NextResponse.json({ status: 'none' });

  const reqRow = await prisma.registrationRequest.findUnique({
    where: { email },
    select: { status: true, passwordHash: true, expiresAt: true },
  });
  // Reveal nothing unless the caller proves ownership with the request password.
  if (!reqRow || !(await verifyPassword(password, reqRow.passwordHash))) {
    return NextResponse.json({ status: 'none' });
  }

  let status = reqRow.status;
  // Treat an overdue pending request as expired even if the cron hasn't swept it.
  if (status === 'pending' && reqRow.expiresAt && reqRow.expiresAt.getTime() <= Date.now()) {
    status = 'expired';
  }
  if (status === 'pending' || status === 'expired' || status === 'denied') {
    return NextResponse.json({ status });
  }
  // approved (a User exists → real bad-credentials) or anything else → generic.
  return NextResponse.json({ status: 'none' });
}
