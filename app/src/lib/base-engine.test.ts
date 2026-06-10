import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { normalizeFieldOptions, baseForOrg, tableForOrg, tablePermission, gateTable, canTransferBase, canTransferTable, FIELD_TYPES } from '@/lib/base-engine';

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

  it('date.reminderDays: kept when a positive int, dropped otherwise, clamped to 365', () => {
    expect((normalizeFieldOptions('date', { reminderDays: 3 }) as any).reminderDays).toBe(3);
    expect((normalizeFieldOptions('date', { reminderDays: 0 }) as any).reminderDays).toBeUndefined();
    expect((normalizeFieldOptions('date', {}) as any).reminderDays).toBeUndefined();
    expect((normalizeFieldOptions('date', { reminderDays: 999 }) as any).reminderDays).toBe(365);
  });

  it('exposes all field types', () => {
    expect([...FIELD_TYPES]).toEqual([
      'text', 'longText', 'number', 'currency', 'percent', 'rating',
      'singleSelect', 'multiSelect', 'date', 'person', 'checkbox',
      'url', 'email', 'phone', 'file', 'totp', 'link', 'password',
    ]);
  });

  it('link options shape: targetTableId + multiple (+ optional displayFieldId)', () => {
    expect(normalizeFieldOptions('link', { targetTableId: 'tbl1', multiple: true })).toEqual({ targetTableId: 'tbl1', multiple: true });
    expect(normalizeFieldOptions('link', { targetTableId: 'tbl1', displayFieldId: 'f9' })).toEqual({ targetTableId: 'tbl1', multiple: false, displayFieldId: 'f9' });
    expect(normalizeFieldOptions('link', {})).toEqual({ targetTableId: '', multiple: false });
  });

  it('currency defaults symbol + precision; percent/rating shape', () => {
    expect(normalizeFieldOptions('currency', {})).toEqual({ symbol: '₴', precision: 2 });
    expect(normalizeFieldOptions('currency', { symbol: '$', precision: 0 })).toEqual({ symbol: '$', precision: 0 });
    expect(normalizeFieldOptions('percent', {})).toEqual({ precision: 0 });
    expect((normalizeFieldOptions('rating', { max: 99 }) as any).max).toBe(10);
    expect((normalizeFieldOptions('rating', {}) as any).max).toBe(5);
  });

  it('url/email/phone/password carry no options', () => {
    expect(normalizeFieldOptions('url', { x: 1 })).toBeUndefined();
    expect(normalizeFieldOptions('email', {})).toBeUndefined();
    expect(normalizeFieldOptions('phone', {})).toBeUndefined();
    expect(normalizeFieldOptions('password', { x: 1 })).toBeUndefined();
  });
});

describe('org access guards (cross-tenant isolation)', () => {
  it('baseForOrg → null when the base belongs to another org', async () => {
    prismaMock.base.findUnique.mockResolvedValue({ id: 'b1', orgId: 'org-B' } as any);
    expect(await baseForOrg('b1', 'org-A', { user: { id: 'u1', role: 'member' } } as any)).toBeNull();
  });

  it('baseForOrg → the base when the org matches', async () => {
    prismaMock.base.findUnique.mockResolvedValue({ id: 'b1', orgId: 'org-A' } as any);
    expect(await baseForOrg('b1', 'org-A', { user: { id: 'u1', role: 'member' } } as any)).toMatchObject({ id: 'b1' });
  });

  it('tableForOrg checks the OWNING base orgId (child inherits)', async () => {
    prismaMock.table.findUnique.mockResolvedValue({ id: 't1', base: { orgId: 'org-B' } } as any);
    expect(await tableForOrg('t1', 'org-A', { user: { id: 'u1', role: 'member' } } as any)).toBeNull();
  });

  it('guards → null when the resource does not exist', async () => {
    prismaMock.base.findUnique.mockResolvedValue(null as any);
    expect(await baseForOrg('missing', 'org-A', { user: { id: 'u1', role: 'member' } } as any)).toBeNull();
  });

  it('tableForOrg REFUSES system tables — even for admins (never via the generic engine)', async () => {
    prismaMock.table.findUnique.mockResolvedValue({ id: 't1', system: true, base: { orgId: 'org-A', visibility: 'org', createdById: null } } as any);
    expect(await tableForOrg('t1', 'org-A', { user: { id: 'u1', role: 'admin' } } as any)).toBeNull();
  });
});

describe('table ownership & ownership transfer', () => {
  const sess = (id: string, role: 'admin' | 'member' = 'member') => ({ user: { id, role } } as any);
  const base = (over: Record<string, unknown> = {}) =>
    ({ id: 'b1', orgId: 'org-A', visibility: 'org', createdById: 'owner', ...over } as any);

  it('tablePermission: a table owner is admin on THEIR table even as a base editor', async () => {
    prismaMock.baseMember.findUnique.mockResolvedValue(null as any); // org-visible base ⇒ editor
    expect(await tablePermission({ createdById: 'u1' }, base({ createdById: 'someoneElse' }), 'org-A', sess('u1'))).toBe('admin');
  });

  it('tablePermission: a non-owner on an org-visible base stays editor', async () => {
    prismaMock.baseMember.findUnique.mockResolvedValue(null as any);
    expect(await tablePermission({ createdById: 'owner' }, base(), 'org-A', sess('u1'))).toBe('editor');
  });

  it('tablePermission: a workspace admin is admin on any table', async () => {
    expect(await tablePermission({ createdById: null }, base(), 'org-A', sess('x', 'admin'))).toBe('admin');
  });

  it('gateTable: blocks a restricted-base viewer from deleting a table they do NOT own', async () => {
    prismaMock.baseMember.findUnique.mockResolvedValue({ role: 'viewer', hiddenFields: [] } as any);
    const res = await gateTable({ createdById: 'owner' }, base({ visibility: 'restricted', createdById: 'owner' }), 'org-A', sess('u1'), 'admin');
    expect(res).not.toBeNull(); // 403
  });

  it('gateTable: lets the table owner delete their table even as a restricted-base viewer', async () => {
    prismaMock.baseMember.findUnique.mockResolvedValue({ role: 'viewer', hiddenFields: [] } as any);
    const res = await gateTable({ createdById: 'u1' }, base({ visibility: 'restricted', createdById: 'owner' }), 'org-A', sess('u1'), 'admin');
    expect(res).toBeNull(); // owner ⇒ admin on this table ⇒ allowed
  });

  it('canTransferBase: only the current owner or a workspace admin', () => {
    expect(canTransferBase({ createdById: 'u1' }, sess('u1'))).toBe(true);
    expect(canTransferBase({ createdById: 'owner' }, sess('u1'))).toBe(false);
    expect(canTransferBase({ createdById: 'owner' }, sess('u1', 'admin'))).toBe(true);
  });

  it('canTransferTable: workspace admin, base owner, or the table owner', () => {
    const b = base({ createdById: 'baseOwner' });
    expect(canTransferTable({ createdById: 'tblOwner' }, b, sess('tblOwner'))).toBe(true);
    expect(canTransferTable({ createdById: 'tblOwner' }, b, sess('baseOwner'))).toBe(true);
    expect(canTransferTable({ createdById: 'tblOwner' }, b, sess('x', 'admin'))).toBe(true);
    expect(canTransferTable({ createdById: 'tblOwner' }, b, sess('rando'))).toBe(false);
  });
});
