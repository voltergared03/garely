import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/cron/reg-cleanup?secret=XXX — called by system cron (e.g. hourly).
// Expires self-registration requests past their TTL so the admin queue stays clean.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const res = await prisma.registrationRequest.updateMany({
    where: { status: 'pending', expiresAt: { lte: new Date() } },
    data: { status: 'expired' },
  });

  return NextResponse.json({ expired: res.count });
}
