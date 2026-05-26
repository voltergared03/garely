import { NextRequest, NextResponse } from 'next/server';
import { verifySetupToken } from '@/lib/setup';
import { rateLimit } from '@/lib/rate-limit';
import { withRoute } from '@/lib/with-route';

function ipOf(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

// POST /api/setup/verify-token { token } → { ok }
async function postHandler(req: NextRequest) {
  const rl = rateLimit(`setup-verify:${ipOf(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }
  const { token } = await req.json().catch(() => ({}));
  const ok = await verifySetupToken(token);
  return NextResponse.json({ ok });
}

export const POST = withRoute('setup.verify-token', postHandler);
