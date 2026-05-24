import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  passwordPolicyError,
  generateTempPassword,
} from '@/lib/password';

describe('passwordPolicyError', () => {
  it('accepts a valid password', () => {
    expect(passwordPolicyError('abcdefgh')).toBeNull();
    expect(passwordPolicyError('a-strong-passphrase')).toBeNull();
  });
  it('rejects non-strings, too short, and too long', () => {
    expect(passwordPolicyError(123)).toBe('Password is required');
    expect(passwordPolicyError(undefined)).toBe('Password is required');
    expect(passwordPolicyError('short')).toBe('Password must be at least 8 characters');
    expect(passwordPolicyError('a'.repeat(201))).toBe('Password is too long');
  });
});

describe('generateTempPassword', () => {
  it('honours the requested length (default 14)', () => {
    expect(generateTempPassword()).toHaveLength(14);
    expect(generateTempPassword(20)).toHaveLength(20);
  });
  it('excludes ambiguous characters (0/O/1/l/I)', () => {
    const pw = generateTempPassword(200);
    expect(pw).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]+$/);
    expect(pw).not.toMatch(/[0O1lI]/);
  });
  it('is random across calls', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });
});

describe('hashPassword / verifyPassword (scrypt round-trip)', () => {
  it('verifies the correct password and rejects wrong ones', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
  it('returns false for empty/invalid stored hashes', async () => {
    expect(await verifyPassword('whatever', null)).toBe(false);
    expect(await verifyPassword('whatever', '')).toBe(false);
    expect(await verifyPassword('whatever', 'not-a-valid-hash')).toBe(false);
  });
});
