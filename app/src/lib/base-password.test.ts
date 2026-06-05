import { describe, it, expect } from 'vitest';
import {
  normalizePassword,
  passwordCellFromSecret,
  passwordCellView,
  decryptPasswordCell,
} from './base-password';

describe('base-password', () => {
  it('normalizePassword: keeps non-empty strings verbatim (no trim), caps length, rejects junk', () => {
    expect(normalizePassword('  s3cret ')).toBe('  s3cret '); // whitespace preserved
    expect(normalizePassword('')).toBeNull();
    expect(normalizePassword(123 as unknown)).toBeNull();
    expect(normalizePassword('x'.repeat(2000))!.length).toBe(1000);
  });

  it('stores ENCRYPTED at rest (no plaintext in the blob); round-trips on decrypt', () => {
    const cell = passwordCellFromSecret('hunter2!');
    expect(typeof cell.enc).toBe('string');
    expect(JSON.stringify(cell)).not.toContain('hunter2!');
    expect(decryptPasswordCell(cell)).toBe('hunter2!');
  });

  it('passwordCellView leaks nothing — only { set }', () => {
    const cell = passwordCellFromSecret('topsecret');
    const view = passwordCellView(cell);
    expect(view).toEqual({ set: true });
    expect(JSON.stringify(view)).not.toContain('topsecret');
    expect(passwordCellView(null)).toEqual({ set: false });
    expect(passwordCellView({})).toEqual({ set: false });
  });

  it('decryptPasswordCell returns null on a non-encrypted cell', () => {
    expect(decryptPasswordCell(null)).toBeNull();
    expect(decryptPasswordCell({ foo: 1 })).toBeNull();
  });
});
