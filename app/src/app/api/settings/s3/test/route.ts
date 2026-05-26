import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getS3Config, testS3 } from '@/lib/s3';
import { withRoute } from '@/lib/with-route';

// POST /api/settings/s3/test — verify saved S3 config (put + delete a tiny object)
async function postHandler() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const t = await getTranslations('errors');
  const config = await getS3Config();
  if (!config) {
    return NextResponse.json({ error: t('s3NotConfigured') }, { status: 400 });
  }
  const result = await testS3(config);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || t('connectionFailed') }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}

export const POST = withRoute('settings.s3.test', postHandler);
