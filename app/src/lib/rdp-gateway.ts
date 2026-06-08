/**
 * Config for the `garely-rdp-gw` sidecar (adopted Devolutions Gateway, §15).
 * The app holds the provisioner PRIVATE key (signs connection tokens) and the
 * gateway's delegation PUBLIC key (encrypts injected credentials so the browser
 * never sees them). All from env; absent → the pillar's live-connect degrades to
 * the "gateway pending" placeholder (the data/management plane still works).
 *
 * Env:
 *   RDP_GW_URL              wss base the browser opens, e.g. wss://meet.example.com/rdp
 *   RDP_GW_PROVISIONER_KEY  PKCS8 PEM RSA private key (RS256) — signs tokens
 *   RDP_GW_DELEGATION_PUBKEY SPKI PEM RSA public key — JWE-wraps credential tokens
 */

/** PEM stored in a single-line env var keeps literal `\n`; restore real newlines. */
export function normalizePem(s: string): string {
  return s.includes('\\n') ? s.replace(/\\n/g, '\n') : s;
}

export function rdpGatewayUrl(): string {
  return (process.env.RDP_GW_URL || '').trim();
}

export function rdpProvisionerKey(): string {
  return normalizePem(process.env.RDP_GW_PROVISIONER_KEY || '');
}

export function rdpDelegationPubKey(): string {
  return normalizePem(process.env.RDP_GW_DELEGATION_PUBKEY || '');
}

/** Live RDP is available only when the gateway URL + a signing key are configured. */
export function rdpGatewayEnabled(): boolean {
  return !!(rdpGatewayUrl() && rdpProvisionerKey());
}
