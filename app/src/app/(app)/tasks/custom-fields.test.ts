import { describe, it, expect } from 'vitest';
import { chipsForRow, customTaskFields, EDITABLE_CUSTOM_TYPES, SYSTEM_FIELD_NAMES } from './custom-fields';
import type { FieldT } from '../database/lib/types';

const f = (id: string, name: string, type: string, options: unknown = null): FieldT =>
  ({ id, tableId: 't', name, type, options, position: 0 } as FieldT);
const members = [{ id: 'u1', name: 'Dana Vasiliev', image: null, email: 'd@x.io' }];

describe('chipsForRow — board custom-field chips', () => {
  it('chips a non-empty editable field', () => {
    expect(chipsForRow([f('fA', 'Client', 'text')], { fA: 'Acme' }, members)).toEqual([{ name: 'Client', text: 'Acme' }]);
  });

  it('skips empty / missing values', () => {
    expect(chipsForRow([f('fA', 'Client', 'text')], { fA: '' }, members)).toEqual([]);
    expect(chipsForRow([f('fA', 'Client', 'text')], {}, members)).toEqual([]);
  });

  it('NEVER chips totp or password — a secret must not surface on the board', () => {
    const fields = [f('fT', 'Secret', 'totp'), f('fP', 'Pass', 'password')];
    const cells = { fT: { set: true, code: '123456' }, fP: { set: true } };
    expect(chipsForRow(fields, cells, members)).toEqual([]);
  });

  it('skips non-editable types (file / link) even when they have a value', () => {
    const fields = [f('fF', 'Doc', 'file'), f('fL', 'Rel', 'link')];
    const cells = { fF: [{ id: 'x', name: 'a.pdf', path: 'p' }], fL: [{ id: 'r', label: 'Row' }] };
    expect(chipsForRow(fields, cells, members)).toEqual([]);
  });

  it('resolves a singleSelect choice to its label', () => {
    const field = f('fS', 'Stage', 'singleSelect', { choices: [{ id: 'c1', name: 'Won' }] });
    expect(chipsForRow([field], { fS: 'c1' }, members)).toEqual([{ name: 'Stage', text: 'Won' }]);
  });

  it('caps at max', () => {
    const fields = [f('a', 'A', 'text'), f('b', 'B', 'text'), f('c', 'C', 'text'), f('d', 'D', 'text')];
    expect(chipsForRow(fields, { a: '1', b: '2', c: '3', d: '4' }, members, 2)).toHaveLength(2);
  });

  it('returns [] for no fields or no cells', () => {
    expect(chipsForRow([], { x: 1 }, members)).toEqual([]);
    expect(chipsForRow([f('a', 'A', 'text')], undefined, members)).toEqual([]);
  });
});

describe('customTaskFields + type sets', () => {
  it('drops the 6 built-in system fields by name', () => {
    const fields = [
      f('1', 'Title', 'text'), f('2', 'Status', 'singleSelect'), f('3', 'Assignee', 'person'),
      f('4', 'Client', 'text'), f('5', 'Budget', 'currency'),
    ];
    expect(customTaskFields(fields).map((x) => x.name)).toEqual(['Client', 'Budget']);
  });

  it('the editable set excludes secret / relation types', () => {
    for (const t of ['totp', 'password', 'file', 'link']) expect(EDITABLE_CUSTOM_TYPES.has(t)).toBe(false);
    for (const t of ['text', 'number', 'singleSelect', 'person', 'date']) expect(EDITABLE_CUSTOM_TYPES.has(t)).toBe(true);
    expect(SYSTEM_FIELD_NAMES.has('Due date')).toBe(true);
  });
});
