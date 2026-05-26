/**
 * Edge-runtime verification of the "2FA passed" cookie, using Web Crypto only
 * (no node:crypto). MUST stay byte-compatible with lib/twofactor.ts:
 *   key  = SHA-256(`${SECRET}|eam-2fa-cookie-v1`)
 *   sig  = base64url( HMAC-SHA256(key, `${userId}.${exp}`) )
 *   cookie value = `${exp}.${sig}`
 */
import { authSecretOrDev } from './secret';

const SECRET = authSecretOrDev();
const enc = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacB64Url(msg: string): Promise<string> {
  const keyData = await crypto.subtle.digest('SHA-256', enc.encode(`${SECRET}|eam-2fa-cookie-v1`));
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return bytesToBase64Url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyTwoFactorCookieEdge(
  value: string | undefined,
  userId: string,
): Promise<boolean> {
  if (!value || !userId) return false;
  const idx = value.indexOf('.');
  if (idx < 0) return false;
  const exp = parseInt(value.slice(0, idx), 10);
  const sig = value.slice(idx + 1);
  if (!exp || !sig) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacB64Url(`${userId}.${exp}`);
  return timingSafeEqual(expected, sig);
}
