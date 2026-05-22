import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getS3Config, testS3 } from '@/lib/s3';

// POST /api/settings/s3/test — verify saved S3 config (put + delete a tiny object)
export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const config = await getS3Config();
  if (!config) {
    return NextResponse.json({ error: 'S3 не налаштовано (заповніть bucket, ключ і секрет)' }, { status: 400 });
  }
  const result = await testS3(config);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Не вдалося підключитись' }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
