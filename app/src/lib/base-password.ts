/**
 * Password cell support for the base engine. SECURITY-CRITICAL.
 *
 * A `password` cell stores ONLY the AES-256-GCM-encrypted value (`{ enc }`) —
 * the plaintext is never written to the DB. Bulk row reads run cells through
 * `passwordCellView`, which returns ONLY `{ set }` (never the value). The
 * plaintext is decrypted server-side and returned EXCLUSIVELY by the dedicated
 * reveal endpoint (access-checked, password-fields-only), on explicit
 * reveal/copy. NODE-ONLY (crypto, AUTH_SECRET-derived key — same as user 2FA).
 */
import { encryptSecret, decryptSecret } from './twofactor';

export type PasswordStoredCell = { enc: string };
export type PasswordView = { set: boolean };
export const MAX_PASSWORD_LEN = 1000;

/** A non-empty string is a usable password; null clears the cell. Not trimmed
 *  (leading/trailing whitespace can be significant in a password). */
export function normalizePassword(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  return input.slice(0, MAX_PASSWORD_LEN);
}

/** Build the stored (encrypted) cell from a plaintext password. */
export function passwordCellFromSecret(plain: string): PasswordStoredCell {
  return { enc: encryptSecret(plain) };
}

/** Stored cell → client-safe view. Only whether a password is set; never the value or blob. */
export function passwordCellView(stored: unknown): PasswordView {
  const enc = stored && typeof stored === 'object' ? (stored as { enc?: unknown }).enc : null;
  return { set: typeof enc === 'string' && !!enc };
}

/** Decrypt a stored cell → plaintext, or null. SERVER-ONLY — only the reveal endpoint calls this. */
export function decryptPasswordCell(stored: unknown): string | null {
  const enc = stored && typeof stored === 'object' ? (stored as { enc?: unknown }).enc : null;
  if (typeof enc !== 'string' || !enc) return null;
  return decryptSecret(enc);
}
