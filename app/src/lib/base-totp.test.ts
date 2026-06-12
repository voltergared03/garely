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

  it('exposes an absolute window boundary (validUntil) the client can anchor to', () => {
    const cell = totpCellFromSecret(SECRET);
    const at = 1_700_000_000_000; // 20s into a 30s window
    const view = totpCellView(cell, at);
    // windowStart = floor(at/1000/30)*30 = 1_699_999_980 → boundary at +30s
    expect(view.validUntil).toBe(1_700_000_010_000);
    expect((view.validUntil ?? 0) - at).toBe((view.remainingSec ?? 0) * 1000); // 10s left
    // The code is computed from the window start, so it equals what an
    // authenticator app shows for the same window (no off-by-one).
    expect(view.code).toBe(totp(SECRET, view.validUntil! - 30_000));
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
