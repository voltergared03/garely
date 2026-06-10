/**
 * Google Calendar two-way sync — OAuth + REST client.
 *
 * Reuses the workspace's existing Google OAuth client (the SSO one) with the
 * additional `calendar` scope; tokens are stored per-user in
 * GoogleCalendarConnection, encrypted at rest with the same AES-256-GCM scheme
 * as TOTP/RDP secrets (lib/twofactor encryptSecret). All sync is scoped to ONE
 * dedicated "Garely" calendar in the user's account — personal events in other
 * calendars are never read or written.
 *
 * Plain fetch instead of the `googleapis` SDK: we use six endpoints and the
 * repo is deliberately dependency-light (hand-rolled ICS, no SDK bloat in the
 * standalone image).
 */
import crypto from 'crypto';
import { prisma } from './prisma';
import { encryptSecret, decryptSecret } from './twofactor';
import { getGoogleConfig, publicBaseUrl } from './config';
import { authSecret } from './secret';
import type { GoogleCalendarConnection } from '@prisma/client';

export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar';
export const GARELY_CALENDAR_SUMMARY = 'Garely';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://www.googleapis.com/calendar/v3';

export async function redirectUri(): Promise<string> {
  return `${await publicBaseUrl()}/api/integrations/google/callback`;
}

/* ── CSRF state (HMAC-signed, 10-min TTL) ───────────────────────── */

function stateHmac(payload: string): string {
  return crypto.createHmac('sha256', `${authSecret()}|gcal-state-v1`).update(payload).digest('base64url');
}

export function signState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  return `${Buffer.from(payload).toString('base64url')}.${stateHmac(payload)}`;
}

export function verifyState(state: string | null): string | null {
  if (!state) return null;
  const [b64, mac] = state.split('.');
  if (!b64 || !mac) return null;
  const payload = Buffer.from(b64, 'base64url').toString('utf8');
  const expect = stateHmac(payload);
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  const [userId, ts] = payload.split('.');
  if (!userId || !ts || Date.now() - Number(ts) > 10 * 60_000) return null;
  return userId;
}

/* ── OAuth ──────────────────────────────────────────────────────── */

export async function buildAuthUrl(userId: string): Promise<string> {
  const { clientId } = await getGoogleConfig();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: await redirectUri(),
    response_type: 'code',
    // openid+email lets us show WHICH Google account is connected.
    scope: `openid email ${GCAL_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on re-connect
    state: signState(userId),
  });
  return `${AUTH_URL}?${p.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = await getGoogleConfig();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  if (!res.ok) throw new Error(`google token endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: await redirectUri() });
}

/** Email claim from the (already TLS-trusted) token endpoint's id_token. */
export function emailFromIdToken(idToken?: string): string | null {
  try {
    if (!idToken) return null;
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/* ── Token storage / refresh ────────────────────────────────────── */

export async function saveTokens(
  conn: { userId: string; orgId: string },
  t: TokenResponse,
  extra: Partial<{ googleEmail: string | null; calendarId: string }> = {},
): Promise<GoogleCalendarConnection> {
  const data = {
    accessTokenCipher: encryptSecret(t.access_token),
    ...(t.refresh_token ? { refreshTokenCipher: encryptSecret(t.refresh_token) } : {}),
    tokenExpiry: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope || null,
    status: 'active',
    lastError: null,
    ...extra,
  };
  return prisma.googleCalendarConnection.upsert({
    where: { userId: conn.userId },
    update: data,
    create: { userId: conn.userId, orgId: conn.orgId, ...data },
  });
}

/**
 * A currently-valid access token for the connection, refreshing (and
 * persisting) it when expired. Marks the connection `revoked` when Google
 * rejects the refresh token (user withdrew access) — surfaced in Settings.
 */
export async function getAccessToken(conn: GoogleCalendarConnection): Promise<string> {
  const cached = decryptSecret(conn.accessTokenCipher);
  if (cached && conn.tokenExpiry && conn.tokenExpiry.getTime() > Date.now()) return cached;

  const refresh = decryptSecret(conn.refreshTokenCipher);
  if (!refresh) throw new Error('no refresh token');
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
    await prisma.googleCalendarConnection.update({
      where: { id: conn.id },
      data: {
        accessTokenCipher: encryptSecret(t.access_token),
        tokenExpiry: new Date(Date.now() + (t.expires_in - 60) * 1000),
        status: 'active',
        lastError: null,
      },
    });
    return t.access_token;
  } catch (e: any) {
    const msg = String(e?.message || e);
    await prisma.googleCalendarConnection.update({
      where: { id: conn.id },
      data: { status: /invalid_grant/.test(msg) ? 'revoked' : 'error', lastError: msg.slice(0, 500) },
    }).catch(() => {});
    throw e;
  }
}

/* ── Calendar REST ──────────────────────────────────────────────── */

export async function gcalFetch(
  conn: GoogleCalendarConnection,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(conn);
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
}

/**
 * Find the dedicated "Garely" calendar in the account (by summary) or create
 * it. Returns its calendarId. Done once at connect time.
 */
export async function ensureGarelyCalendar(conn: GoogleCalendarConnection): Promise<string> {
  const list = await gcalFetch(conn, '/users/me/calendarList?minAccessRole=owner&maxResults=250');
  if (list.ok) {
    const items: any[] = (await list.json()).items || [];
    const hit = items.find((c) => (c.summaryOverride || c.summary) === GARELY_CALENDAR_SUMMARY);
    if (hit?.id) return hit.id;
  }
  const created = await gcalFetch(conn, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: GARELY_CALENDAR_SUMMARY }),
  });
  if (!created.ok) throw new Error(`create calendar failed ${created.status}: ${(await created.text()).slice(0, 300)}`);
  return (await created.json()).id as string;
}

/** Best-effort revoke at Google + delete our connection row. */
export async function disconnect(conn: GoogleCalendarConnection): Promise<void> {
  const refresh = decryptSecret(conn.refreshTokenCipher) || decryptSecret(conn.accessTokenCipher);
  if (refresh) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' })
      .catch(() => {});
  }
  if (conn.channelId && conn.resourceId) {
    await gcalFetch(conn, '/channels/stop', {
      method: 'POST',
      body: JSON.stringify({ id: conn.channelId, resourceId: conn.resourceId }),
    }).catch(() => {});
  }
  await prisma.googleCalendarConnection.delete({ where: { id: conn.id } }).catch(() => {});
}
