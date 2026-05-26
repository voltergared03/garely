import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { createReadStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import { userCanAccessMeeting } from '@/lib/access';

// GET — stream the recording file (auth required)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const { id } = await params;
  const rec = await prisma.recording.findUnique({ where: { id } });
  if (!rec || !rec.filePath) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Authorization: only members of the recording's meeting (or admin) may stream it.
  if (!(await userCanAccessMeeting(rec.meetingId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let stat;
  try {
    stat = await fs.stat(rec.filePath);
  } catch {
    return NextResponse.json({ error: 'File missing' }, { status: 404 });
  }

  const range = req.headers.get('range');
  const ext = (rec.fileName || '').toLowerCase();
  const contentType = ext.endsWith('.webm') ? 'video/webm' : ext.endsWith('.ogg') ? 'video/ogg' : 'video/mp4';

  // Range request → partial content (enables video seeking)
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      const chunk = createReadStream(rec.filePath, { start, end });
      return new NextResponse(Readable.toWeb(chunk) as any, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
        },
      });
    }
  }

  const stream = createReadStream(rec.filePath);
  return new NextResponse(Readable.toWeb(stream) as any, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="${rec.fileName}"`,
    },
  });
}
