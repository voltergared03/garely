import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { normalizeFieldOptions, baseForOrg, tableForOrg, FIELD_TYPES } from '@/lib/base-engine';

vi.mock('@/lib/prisma');
beforeEach(() => mockReset(prismaMock));

describe('normalizeFieldOptions', () => {
  it('text / longText / checkbox have no options (undefined)', () => {
    expect(normalizeFieldOptions('text', { foo: 1 })).toBeUndefined();
    expect(normalizeFieldOptions('longText', undefined)).toBeUndefined();
    expect(normalizeFieldOptions('checkbox', {})).toBeUndefined();
  });

  it('select: assigns ids to new choices, preserves provided ids + color', () => {
    const out = normalizeFieldOptions('singleSelect', {
      choices: [{ name: 'A' }, { id: 'keep', name: 'B', color: '#f00' }],
    }) as any;
    expect(out.choices).toHaveLength(2);
    expect(out.choices[0].id).toBeTruthy();
    expect(out.choices[1].id).toBe('keep');
    expect(out.choices[1].color).toBe('#f00');
  });

  it('select: drops nameless / malformed choices', () => {
    const out = normalizeFieldOptions('multiSelect', {
      choices: [{ name: '' }, { foo: 1 }, { name: 'ok' }],
    }) as any;
    expect(out.choices).toHaveLength(1);
    expect(out.choices[0].name).toBe('ok');
  });

  it('number precision clamps to 0..8 and defaults to 0', () => {
    expect((normalizeFieldOptions('number', { precision: 20 }) as any).precision).toBe(8);
    expect((normalizeFieldOptions('number', { precision: -5 }) as any).precision).toBe(0);
    expect((normalizeFieldOptions('number', {}) as any).precision).toBe(0);
    expect((normalizeFieldOptions('number', { precision: 2 }) as any).precision).toBe(2);
  });

  it('date.includeTime and person.multiple coerce to booleans', () => {
    expect((normalizeFieldOptions('date', { includeTime: 1 }) as any).includeTime).toBe(true);
    expect((normalizeFieldOptions('date', {}) as any).includeTime).toBe(false);
    expect((normalizeFieldOptions('person', { multiple: 'yes' }) as any).multiple).toBe(true);
    expect((normalizeFieldOptions('person', {}) as any).multiple).toBe(false);
  });

  it('exposes the 8 v1 field types', () => {
    expect([...FIELD_TYPES]).toEqual([
      'text', 'longText', 'number', 'singleSelect', 'multiSelect', 'date', 'person', 'checkbox',
    ]);
  });
});

describe('org access guards (cross-tenant isolation)', () => {
  it('baseForOrg → null when the base belongs to another org', async () => {
    prismaMock.base.findUnique.mockResolvedValue({ id: 'b1', orgId: 'org-B' } as any);
    expect(await baseForOrg('b1', 'org-A')).toBeNull();
  });

  it('baseForOrg → the base when the org matches', async () => {
    prismaMock.base.findUnique.mockResolvedValue({ id: 'b1', orgId: 'org-A' } as any);
    expect(await baseForOrg('b1', 'org-A')).toMatchObject({ id: 'b1' });
  });

  it('tableForOrg checks the OWNING base orgId (child inherits)', async () => {
    prismaMock.table.findUnique.mockResolvedValue({ id: 't1', base: { orgId: 'org-B' } } as any);
    expect(await tableForOrg('t1', 'org-A')).toBeNull();
  });

  it('guards → null when the resource does not exist', async () => {
    prismaMock.base.findUnique.mockResolvedValue(null as any);
    expect(await baseForOrg('missing', 'org-A')).toBeNull();
  });
});
