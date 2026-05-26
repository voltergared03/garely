import { NextRequest, NextResponse } from 'next/server';
import { verifySetupToken } from '@/lib/setup';
import { writeConfig } from '@/lib/config';
import { rateLimit } from '@/lib/rate-limit';
import { withRoute } from '@/lib/with-route';

// Only these config namespaces may be written through the setup flow.
const ALLOW_PREFIX = ['WS_', 'AUTH_', 'GOOGLE_', 'DEEPSEEK_', 'DEEPGRAM_', 'SMTP_', 'S3_'];

function ipOf(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

// POST /api/setup/config { token, values: { KEY: value } } — token-gated config write.
async function postHandler(req: NextRequest) {
  const rl = rateLimit(`setup-config:${ipOf(req)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const token = body?.token as string | undefined;
  const values = body?.values as Record<string, unknown> | undefined;

  if (!(await verifySetupToken(token))) {
    return NextResponse.json({ error: 'Invalid or expired setup token' }, { status: 403 });
  }
  if (!values || typeof values !== 'object') {
    return NextResponse.json({ error: 'values object required' }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (ALLOW_PREFIX.some((p) => k.startsWith(p)) && typeof v === 'string') {
      updates[k] = v;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid config keys' }, { status: 400 });
  }

  await writeConfig(updates);
  return NextResponse.json({ ok: true, saved: Object.keys(updates) });
}

export const POST = withRoute('setup.config', postHandler);
