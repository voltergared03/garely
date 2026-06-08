import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI, jwtVerify, compactDecrypt } from 'jose';
import { mintConnectionToken } from './rdp-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let provPub: any, delegPriv: any;

beforeAll(async () => {
  const prov = await generateKeyPair('RS256', { extractable: true });
  provPub = prov.publicKey;
  const deleg = await generateKeyPair('RSA-OAEP-256', { extractable: true });
  delegPriv = deleg.privateKey;
  process.env.RDP_GW_URL = 'wss://example/rdp';
  process.env.RDP_GW_PROVISIONER_KEY = await exportPKCS8(prov.privateKey);
  process.env.RDP_GW_DELEGATION_PUBKEY = await exportSPKI(deleg.publicKey);
});

describe('mintConnectionToken', () => {
  it('forward token without creds is a verifiable RS256 JWS', async () => {
    const tok = await mintConnectionToken({ host: '10.0.0.5', port: 3389 });
    expect(tok.split('.').length).toBe(3); // compact JWS
    const { payload } = await jwtVerify(tok, provPub);
    expect(payload.jet_cm).toBe('fwd');
    expect(payload.jet_ap).toBe('rdp');
    expect(payload.dst_hst).toBe('10.0.0.5:3389');
    expect(payload.dst_pwd).toBeUndefined();
  });

  it('credential injection wraps the signed token in a JWE — browser cannot read creds', async () => {
    const tok = await mintConnectionToken({
      host: 'host', port: 3389, dstUser: 'Administrator', dstPassword: 'sup3r-secret',
    });
    expect(tok.split('.').length).toBe(5); // compact JWE
    expect(tok).not.toContain('sup3r-secret');
    expect(tok).not.toContain('Administrator');
    // only the gateway's delegation key can open it
    const { plaintext } = await compactDecrypt(tok, delegPriv);
    const innerJws = new TextDecoder().decode(plaintext);
    const { payload } = await jwtVerify(innerJws, provPub);
    expect(payload.jet_cm).toBe('fwd');
    expect(payload.dst_usr).toBe('Administrator');
    expect(payload.dst_pwd).toBe('sup3r-secret');
  });

  it('refuses credential injection when no delegation key is configured', async () => {
    const saved = process.env.RDP_GW_DELEGATION_PUBKEY;
    delete process.env.RDP_GW_DELEGATION_PUBKEY;
    await expect(
      mintConnectionToken({ host: 'h', port: 3389, dstUser: 'u', dstPassword: 'p' }),
    ).rejects.toThrow();
    process.env.RDP_GW_DELEGATION_PUBKEY = saved;
  });
});
