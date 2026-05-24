import { describe, it, expect } from 'vitest';
import en from './en.json';
import uk from './uk.json';

type Json = Record<string, unknown>;

/** Flatten a nested message catalog into dotted leaf keys → string values. */
function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Json, key));
    else out[key] = String(v);
  }
  return out;
}

/**
 * Names of simple `{name}` interpolation arguments. ICU plural/select messages
 * are skipped (sentinel) — their branch submessages contain locale-specific
 * TEXT that a regex would mistake for placeholders; both locales carry the same
 * sentinel so they still compare equal.
 */
function placeholders(value: string): string {
  if (/,\s*(plural|select|selectordinal)\b/.test(value)) return '«icu»';
  const names = new Set<string>();
  const re = /\{\s*(\w+)\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) names.add(m[1]);
  return [...names].sort().join(',');
}

const enFlat = flatten(en as Json);
const ukFlat = flatten(uk as Json);

describe('i18n catalogs', () => {
  it('en and uk have identical key sets', () => {
    const missingInUk = Object.keys(enFlat).filter((k) => !(k in ukFlat));
    const missingInEn = Object.keys(ukFlat).filter((k) => !(k in enFlat));
    expect(missingInUk, 'present in en, missing in uk').toEqual([]);
    expect(missingInEn, 'present in uk, missing in en').toEqual([]);
  });

  it('has no empty values', () => {
    const empty = (m: Record<string, string>) =>
      Object.entries(m).filter(([, v]) => v.trim() === '').map(([k]) => k);
    expect(empty(enFlat)).toEqual([]);
    expect(empty(ukFlat)).toEqual([]);
  });

  it('uses matching interpolation placeholders across locales', () => {
    const mismatches: string[] = [];
    for (const key of Object.keys(enFlat)) {
      if (!(key in ukFlat)) continue;
      const a = placeholders(enFlat[key]);
      const b = placeholders(ukFlat[key]);
      if (a !== b) mismatches.push(`${key}: en[${a}] vs uk[${b}]`);
    }
    expect(mismatches).toEqual([]);
  });
});
