/**
 * Credential vault for the Servers / Remote Access pillar (§15). SECURITY-CRITICAL.
 *
 * RDP passwords are stored ONLY as AES-256-GCM ciphertext in
 * `ServerConnection.secretCipher` (format `v1.iv.tag.ct`, base64url) via
 * lib/twofactor `encryptSecret` — the same AUTH_SECRET-derived, fail-closed scheme
 * used for user 2FA + base password cells. The plaintext is NEVER returned to the
 * browser; it is decrypted ONLY server-side at connect time (by the Rust gateway,
 * which replicates this exact format) or by an access-checked internal reveal.
 *
 * NODE-ONLY (crypto). Never import into a client component.
 */
import { encryptSecret, decryptSecret } from './twofactor';

export const MAX_SERVER_PASSWORD_LEN = 1000;

/** A non-empty string is a usable password; null leaves the stored cipher unchanged
 *  (callers treat null as "don't touch"). Not trimmed — whitespace can be significant. */
export function normalizeServerPassword(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  return input.slice(0, MAX_SERVER_PASSWORD_LEN);
}

/** Encrypt a plaintext RDP password → the `secretCipher` column value. */
export function encryptServerSecret(plain: string): string {
  return encryptSecret(plain);
}

/** Decrypt `secretCipher` → plaintext (''=none/failed). SERVER-ONLY: gateway connect
 *  or the access-checked internal reveal endpoint. Never expose the result to the client. */
export function decryptServerSecret(cipher: string | null | undefined): string {
  return decryptSecret(cipher);
}

/** Shape of a ServerConnection row as read from Prisma (subset we expose-or-strip). */
export type ServerConnectionRow = {
  id: string;
  orgId: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  secretCipher: string | null;
  domain: string | null;
  settings: unknown;
  departmentId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Client-safe view — strips `secretCipher`, exposes only `hasSecret`. */
export type ServerConnectionView = {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  domain: string | null;
  settings: unknown;
  departmentId: string | null;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

export function serverConnectionView(c: ServerConnectionRow): ServerConnectionView {
  return {
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    protocol: c.protocol,
    username: c.username,
    domain: c.domain,
    settings: c.settings ?? {},
    departmentId: c.departmentId,
    hasSecret: !!c.secretCipher,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Member-safe view — for non-admin users a server is granted TO. Deliberately omits
 *  the connection target (host/port), the login (username/domain) and free-form settings:
 *  a grantee may connect and see presence, but must NOT learn the server's address or
 *  credentials identity, nor be able to reconfigure it (mutations are admin-only). The
 *  destination + credentials still reach the browser at connect time (the in-browser
 *  IronRDP client performs NLA itself) — this view governs the listing/detail surface. */
export type ServerConnectionMemberView = {
  id: string;
  name: string;
  protocol: string;
  departmentId: string | null;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

export function serverConnectionMemberView(c: ServerConnectionRow): ServerConnectionMemberView {
  return {
    id: c.id,
    name: c.name,
    protocol: c.protocol,
    departmentId: c.departmentId,
    hasSecret: !!c.secretCipher,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
