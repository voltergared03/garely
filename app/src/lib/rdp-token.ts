/**
 * Mint a Devolutions-Gateway connection token for the browser RDP client (§15).
 * SECURITY-CRITICAL — NODE-ONLY.
 *
 * The token is a provisioner-signed (RS256) JWS carrying the Jet "forward"
 * association claims (jet_cm=fwd, jet_ap=rdp, dst_hst). When we inject the target
 * credentials (so the user never types or sees them), the signed claims also carry
 * the encrypted `CredsClaims` and the WHOLE JWS is wrapped in a JWE (RSA-OAEP-256 +
 * A256GCM) to the gateway's delegation public key — the browser receives an opaque
 * blob it cannot read; only the gateway decrypts + injects the credentials.
 */
import { SignJWT, CompactEncrypt, importPKCS8, importSPKI } from 'jose';
import { randomUUID } from 'node:crypto';
import { rdpProvisionerKey, rdpDelegationPubKey } from './rdp-gateway';

export interface MintConnectionTokenInput {
  host: string;
  port: number;
  /** Target credentials to inject; omit/empty → no injection (client must auth). */
  dstUser?: string;
  dstPassword?: string;
  /** Token lifetime; clamped to [30, 600] s. Short-lived by design. */
  ttlSec?: number;
}

/**
 * Returns a compact JWS (no creds) or a compact JWE wrapping the JWS (creds
 * injected). Throws if the provisioner key is unset, or if creds are requested
 * without a delegation key (we refuse to ship credentials the gateway can't
 * protect — they would otherwise be readable in the browser).
 */
export async function mintConnectionToken(input: MintConnectionTokenInput): Promise<string> {
  const provisionerPem = rdpProvisionerKey();
  if (!provisionerPem) throw new Error('RDP gateway provisioner key not configured');

  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(Math.max(input.ttlSec ?? 120, 30), 600);
  const injectCreds = !!input.dstUser;

  const claims: Record<string, unknown> = {
    jet_cm: 'fwd',
    jet_ap: 'rdp',
    jet_rec: 'none',
    jet_aid: randomUUID(),
    dst_hst: `${input.host}:${input.port}`,
  };
  if (injectCreds) {
    // CredsClaims (flattened): prx_* is the proxy hop, dst_* the target. For a
    // single-hop RDP forward both are the target credentials.
    claims.prx_usr = input.dstUser;
    claims.prx_pwd = input.dstPassword ?? '';
    claims.dst_usr = input.dstUser;
    claims.dst_pwd = input.dstPassword ?? '';
  }

  const signKey = await importPKCS8(provisionerPem, 'RS256');
  const jws = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setNotBefore(now)
    .setExpirationTime(now + ttl)
    .setJti(randomUUID())
    .sign(signKey);

  if (!injectCreds) return jws;

  const delegationPem = rdpDelegationPubKey();
  if (!delegationPem) {
    throw new Error('RDP gateway delegation key required for credential injection');
  }
  const encKey = await importSPKI(delegationPem, 'RSA-OAEP-256');
  return new CompactEncrypt(new TextEncoder().encode(jws))
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', cty: 'JWT' })
    .encrypt(encKey);
}
