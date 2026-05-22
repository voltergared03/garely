import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readConfig, writeConfig, CONFIG_DEFAULTS } from '@/lib/config';

const BOOL_KEYS = ['WS_GUEST_ACCESS', 'WS_AI_SUMMARY', 'WS_LIVE_TRANSCRIPTION', 'WS_RECORD_ALL', 'WS_REQUIRE_2FA'];
const STR_KEYS = ['WS_NAME', 'WS_DOMAIN', 'WS_TIMEZONE', 'WS_LANGUAGE'];
const NUM_KEYS = ['WS_MAX_PARTICIPANTS', 'WS_MAX_DURATION_MIN', 'WS_RETENTION_DAYS', 'PRICE_DEEPSEEK_IN', 'PRICE_DEEPSEEK_OUT', 'PRICE_DEEPGRAM_MIN', 'EMAIL_LIMIT'];
const ALL_KEYS = [...BOOL_KEYS, ...STR_KEYS, ...NUM_KEYS];

// GET /api/settings/workspace — workspace + pricing config (merged with defaults)
export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const saved = await readConfig(ALL_KEYS);
  const out: Record<string, string | boolean | number> = {};
  for (const k of STR_KEYS) out[k] = saved[k] ?? CONFIG_DEFAULTS[k];
  for (const k of BOOL_KEYS) out[k] = (saved[k] ?? CONFIG_DEFAULTS[k]) === 'true';
  for (const k of NUM_KEYS) out[k] = Number(saved[k] ?? CONFIG_DEFAULTS[k]);

  return NextResponse.json(out);
}

// PATCH /api/settings/workspace — save workspace + pricing config
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const updates: Record<string, string> = {};

  for (const k of STR_KEYS) {
    if (typeof body[k] === 'string') updates[k] = body[k].trim();
  }
  for (const k of BOOL_KEYS) {
    if (body[k] !== undefined) updates[k] = body[k] ? 'true' : 'false';
  }
  for (const k of NUM_KEYS) {
    if (body[k] !== undefined && body[k] !== '') {
      const n = Number(body[k]);
      if (Number.isFinite(n) && n >= 0) updates[k] = String(n);
    }
  }

  // Guard against self-lockout: don't let an admin turn ON the 2FA requirement
  // unless they have 2FA enabled themselves. Only enforced on the false→true
  // transition, so unrelated saves while it's already on aren't blocked.
  if (updates.WS_REQUIRE_2FA === 'true') {
    const current = await readConfig(['WS_REQUIRE_2FA']);
    if (current.WS_REQUIRE_2FA !== 'true') {
      const me = (await prisma.user.findUnique({
        where: { id: (session.user as any).id },
        select: { totpEnabled: true } as any,
      })) as any;
      if (!me?.totpEnabled) {
        return NextResponse.json(
          { error: 'Спершу налаштуйте власну 2FA, щоб увімкнути цю вимогу' },
          { status: 400 },
        );
      }
    }
  }

  await writeConfig(updates);
  return NextResponse.json({ success: true, updated: Object.keys(updates) });
}
