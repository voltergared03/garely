import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readConfig } from './config';

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const S3_KEYS = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE'];

/** Read S3 config from SystemConfig. Returns null if not fully configured. */
export async function getS3Config(): Promise<S3Config | null> {
  const m = await readConfig(S3_KEYS);
  const bucket = (m.S3_BUCKET || '').trim();
  const accessKeyId = (m.S3_ACCESS_KEY || '').trim();
  const secretAccessKey = m.S3_SECRET_KEY || '';
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: (m.S3_ENDPOINT || '').trim() || undefined,
    region: (m.S3_REGION || '').trim() || 'us-east-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: m.S3_FORCE_PATH_STYLE === 'true',
  };
}

export function makeS3Client(c: S3Config): S3Client {
  return new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: c.forcePathStyle,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
}

/** Verify credentials + bucket write access by putting and deleting a tiny object. */
export async function testS3(c: S3Config): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = makeS3Client(c);
    const key = `__eam-test-${Date.now()}.txt`;
    await client.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: 'eam-meet connection test', ContentType: 'text/plain' }));
    await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Upload a file to the configured bucket. Returns the object key, or null if S3 not configured. */
export async function uploadToS3(key: string, body: Buffer | Uint8Array | string, contentType?: string): Promise<string | null> {
  const c = await getS3Config();
  if (!c) return null;
  const client = makeS3Client(c);
  await client.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: body, ContentType: contentType }));
  return key;
}

/** Delete an object from the configured bucket. */
export async function deleteFromS3(key: string): Promise<boolean> {
  const c = await getS3Config();
  if (!c) return false;
  const client = makeS3Client(c);
  await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
  return true;
}

/** Generate a temporary signed download URL for an object (default 1h). */
export async function signedDownloadUrl(key: string, expiresIn = 3600): Promise<string | null> {
  const c = await getS3Config();
  if (!c) return null;
  const client = makeS3Client(c);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: c.bucket, Key: key }), { expiresIn });
}
