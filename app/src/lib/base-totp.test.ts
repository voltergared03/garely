import { describe, it, expect } from 'vitest';
import { normalizeTotpSecret, totpCellFromSecret, totpCellView } from './base-totp';
import { totp } from './totp';

const SECRET = 'JBSWY3DPEHPK3PXP'; // sample base32 secret

describe('base-totp', () => {
  it('normalizeTotpSecret cleans spaces/case and rejects junk', () => {
    expect(normalizeTotpSecret('jbsw y3dp ehpk 3pxp')).toBe('JBSWY3DPEHPK3PXP');
    expect(normalizeTotpSecret('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
    expect(normalizeTotpSecret('short')).toBeNull();
    expect(normalizeTotpSecret('')).toBeNull();
    expect(normalizeTotpSecret(123)).toBeNull();
    expect(normalizeTotpSecret(null)).toBeNull();
  });

  it('encrypts the secret + view returns a live code that matches a standard authenticator', () => {
    const cell = totpCellFromSecret(SECRET);
    expect(typeof cell.enc).toBe('string');
    expect(cell.enc).not.toContain(SECRET); // stored encrypted, not plaintext

    const at = 1_700_000_000_000;
    const view = totpCellView(cell, at);
    expect(view.set).toBe(true);
    expect(view.code).toMatch(/^\d{6}$/);
    expect(view.code).toBe(totp(SECRET, at)); // server code == what an authenticator app shows
    expect(view.period).toBe(30);
    expect(view.remainingSec).toBeGreaterThan(0);
    expect(view.remainingSec).toBeLessThanOrEqual(30);
  });

  it('SECURITY: the view never leaks the secret or the encrypted blob', () => {
    const cell = totpCellFromSecret(SECRET);
    const view = totpCellView(cell);
    const json = JSON.stringify(view);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain(cell.enc);
    expect('enc' in view).toBe(false);
  });

  it('view is {set:false} for empty / invalid cells', () => {
    expect(totpCellView(null)).toEqual({ set: false });
    expect(totpCellView({})).toEqual({ set: false });
    expect(totpCellView('whatever')).toEqual({ set: false });
    expect(totpCellView({ enc: 'not-a-valid-ciphertext' })).toEqual({ set: false });
  });
});
