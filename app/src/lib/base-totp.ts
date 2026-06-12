/**
 * TOTP ("2FA code") cell support for the base engine. SECURITY-CRITICAL.
 *
 * A `totp` cell stores ONLY the AES-256-GCM-encrypted secret (`{ enc }`) — the
 * plaintext seed is never written to the DB and is NEVER sent to any client.
 * Every read path runs the stored cell through `totpCellView`, which returns the
 * *current code* + a countdown, but never the secret. Codes are computed
 * server-side (RFC 6238, SHA1/6 digits/30s — Google Authenticator-compatible).
 * NODE-ONLY (crypto, AUTH_SECRET-derived key).
 */
import { totp, base32Decode } from './totp';
import { encryptSecret, decryptSecret } from './twofactor';

export const TOTP_STEP = 30; // seconds per rotation

export type TotpStoredCell = { enc: string };
// `validUntil` = absolute epoch-ms when the current code expires (the window
// boundary). The client must anchor its countdown to this against its own
// wall-clock, NOT integrate a seeded `remainingSec` (which drifts / freezes in
// background tabs → shows a code from a window that already rotated).
export type TotpView = { set: boolean; code?: string; period?: number; remainingSec?: number; validUntil?: number };

/** Clean + validate a pasted base32 secret (tolerates spaces / lowercase). null if not a usable secret. */
export function normalizeTotpSecret(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (clean.length < 8) return null;
  if (base32Decode(clean).length < 5) return null;
  return clean;
}

/** Build the stored (encrypted) cell from a validated secret. */
export function totpCellFromSecret(secretBase32: string): TotpStoredCell {
  return { enc: encryptSecret(secretBase32) };
}

/**
 * Stored cell → client-safe view. Returns the live code + seconds remaining in
 * the current window, or `{ set: false }` when no/invalid secret. Never returns
 * the secret or the encrypted blob.
 */
export function totpCellView(stored: unknown, now = Date.now()): TotpView {
  const enc = stored && typeof stored === 'object' ? (stored as { enc?: unknown }).enc : null;
  if (typeof enc !== 'string' || !enc) return { set: false };
  const secret = decryptSecret(enc);
  if (!secret) return { set: false };
  const epoch = Math.floor(now / 1000);
  const windowStart = epoch - (epoch % TOTP_STEP);
  return {
    set: true,
    // Compute from the window start so code + boundary are the same window.
    code: totp(secret, windowStart * 1000, TOTP_STEP),
    period: TOTP_STEP,
    remainingSec: windowStart + TOTP_STEP - epoch,
    validUntil: (windowStart + TOTP_STEP) * 1000,
  };
}
