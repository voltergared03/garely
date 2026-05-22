import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readConfig, getDeepSeekConfig } from '@/lib/config';
import { getSmtpConfig } from '@/lib/email';
import { getS3Config } from '@/lib/s3';

// GET /api/settings/integrations — real status + metrics for each integration
export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // PostgreSQL: ping + size
  let dbStatus: 'connected' | 'error' = 'error';
  let dbSize = '';
  try {
    const rows = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    const bytes = Number(rows[0]?.size || 0);
    dbSize = bytes >= 1048576 ? `${(bytes / 1048576).toFixed(0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }

  const [userCount, liveMeetings] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.meeting.count({ where: { status: 'live' } }).catch(() => 0),
  ]);

  const keys = await readConfig(['DEEPSEEK_API_KEY', 'DEEPGRAM_API_KEY', 'DEEPGRAM_MODEL']);
  const ds = await getDeepSeekConfig();
  const smtp = await getSmtpConfig().catch(() => null);
  const s3 = await getS3Config().catch(() => null);

  const deepseekOk = !!(keys.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY);
  const deepgramOk = !!(keys.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY);
  const livekitOk = !!(process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_API_KEY);
  const googleOk = !!process.env.GOOGLE_CLIENT_ID;

  const integrations = [
    { name: 'LiveKit', desc: 'WebRTC SFU', status: livekitOk ? 'connected' : 'not_configured', metric: liveMeetings > 0 ? `${liveMeetings} активних` : 'self-hosted' },
    { name: 'Deepgram', desc: 'Multilingual STT', status: deepgramOk ? 'connected' : 'not_configured', metric: keys.DEEPGRAM_MODEL || 'nova-3' },
    { name: 'DeepSeek', desc: 'LLM · summary, action items', status: deepseekOk ? 'connected' : 'not_configured', metric: ds.model },
    { name: 'SMTP Email', desc: 'Транзакційна пошта · nodemailer', status: smtp ? 'connected' : 'not_configured', metric: smtp ? smtp.host : 'не налаштовано' },
    { name: 'Google OAuth', desc: 'SSO для команди', status: googleOk ? 'connected' : 'not_configured', metric: `${userCount} ${userCount === 1 ? 'юзер' : userCount < 5 ? 'юзери' : 'юзерів'}` },
    { name: 'PostgreSQL', desc: 'Prisma · self-hosted', status: dbStatus, metric: dbSize },
    { name: 'S3 Storage', desc: 'Записи мітингів', status: s3 ? 'connected' : 'not_configured', metric: s3 ? s3.bucket : 'не налаштовано' },
  ];

  return NextResponse.json({ integrations });
}
