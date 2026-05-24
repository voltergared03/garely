/**
 * Password hashing for credentials auth. Uses scrypt from `node:crypto` — no
 * native dependency (keeps `npm ci` and the Docker build clean). NODE-ONLY:
 * never import from Edge/middleware.
 *
 * Stored format: `scrypt$N$r$p$saltB64url$hashB64url`
 */
import crypto from 'node:crypto';

const N = 16384; // CPU/memory cost (2^14)
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      keylen,
      { N: params.N, r: params.r, p: params.p, maxmem: MAXMEM },
      (err, derivedKey) => (err ? reject(err) : resolve(derivedKey)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const dk = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${dk.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const params = { N: parseInt(parts[1], 10), r: parseInt(parts[2], 10), p: parseInt(parts[3], 10) };
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (!expected.length) return false;
    const dk = await scryptAsync(password, salt, expected.length, params);
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

/** Minimal password policy applied wherever a password is set. */
export function passwordPolicyError(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Пароль обовʼязковий';
  if (pw.length < 8) return 'Пароль має містити щонайменше 8 символів';
  if (pw.length > 200) return 'Пароль задовгий';
  return null;
}
