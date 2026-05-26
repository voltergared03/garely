// Centralized secret resolution.
//
// Previously these chains were duplicated — with subtle differences — across
// internal-auth.ts, twofactor.ts, twofactor-edge.ts and middleware.ts. This is
// edge-safe: it only reads process.env (no Node APIs), so the edge runtime
// (middleware, twofactor-edge) can import it.

/** NextAuth session secret (verifies the JWT, derives 2FA crypto). '' if unset. */
export function authSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
}

/**
 * Session secret with a fixed dev fallback so local runs work without
 * AUTH_SECRET set.
 *
 * TODO(Phase 4 — security hardening): in production an unset secret must fail
 * closed rather than fall back to this public constant (a misconfigured prod
 * would otherwise derive predictable 2FA keys).
 */
export function authSecretOrDev(): string {
  return authSecret() || 'dev-insecure-secret-change-me';
}

/** Shared secret for internal/machine callers (Python agent, internal webhooks). */
export function internalSecret(): string {
  return (
    process.env.INTERNAL_API_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    ''
  );
}
