import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import { withRoute } from '@/lib/with-route';

// GET /api/cron/recordings?secret=XXX — called by system cron (daily).
// Deletes recordings whose retention window expired (file + DB row), skipping
// permanent ones.
async function getHandler(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const expired = await prisma.recording.findMany({
    where: { permanent: false, expiresAt: { not: null, lte: now } },
  });

  let deleted = 0;
  for (const rec of expired) {
    if (rec.filePath) await fs.unlink(rec.filePath).catch(() => {});
    await prisma.recording.delete({ where: { id: rec.id } }).catch(() => {});
    deleted++;
  }

  return NextResponse.json({ deleted });
}

export const GET = withRoute('cron.recordings', getHandler);
