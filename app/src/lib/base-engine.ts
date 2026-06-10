import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Session } from 'next-auth';
import { prisma } from './prisma';
import { jsonError } from './http';

/**
 * Base engine (Phase 2, roadmap §14) — shared helpers for the generic
 * Base → Table → Field → Row → View data engine.
 *
 * Tenancy: `Base` carries `orgId`; Table/Field/Row/View inherit it via Base.
 * Every child-resource access guard resolves the owning Base's orgId and
 * compares it to the caller's current org (returns the row or null → 404).
 */

// ---- Field types ----------------------------------------------------------
export const fieldTypeSchema = z.enum([
  'text',
  'longText',
  'number',
  'currency',
  'percent',
  'rating',
  'singleSelect',
  'multiSelect',
  'date',
  'person',
  'checkbox',
  'url',
  'email',
  'phone',
  'file',
  'totp',
  'link',
  'password',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;
export const FIELD_TYPES = fieldTypeSchema.options;

export type SelectChoice = { id: string; name: string; color?: string };

/**
 * Validate / shape a field's `options` for its type. Returns a plain object to
 * store, or `undefined` (no options → Prisma leaves the column null on create,
 * unchanged on update — avoids the Prisma.JsonNull dance). Existing select
 * choice ids are preserved (so stored Row values stay valid across renames).
 */
export function normalizeFieldOptions(
  type: FieldType,
  raw: unknown,
): Prisma.InputJsonValue | undefined {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  switch (type) {
    case 'singleSelect':
    case 'multiSelect': {
      const choices: SelectChoice[] = Array.isArray(o.choices)
        ? o.choices
            .filter((c: any) => c && typeof c.name === 'string' && c.name.trim())
            .map((c: any) => ({
              id: typeof c.id === 'string' && c.id ? c.id : randomUUID(),
              name: String(c.name).trim().slice(0, 80),
              ...(typeof c.color === 'string' && c.color ? { color: c.color } : {}),
            }))
        : [];
      return { choices };
    }
    case 'number':
      return {
        precision: Number.isInteger(o.precision) ? Math.min(Math.max(o.precision, 0), 8) : 0,
      };
    case 'currency':
      return {
        symbol: typeof o.symbol === 'string' && o.symbol.trim() ? o.symbol.trim().slice(0, 4) : '₴',
        precision: Number.isInteger(o.precision) ? Math.min(Math.max(o.precision, 0), 8) : 2,
      };
    case 'percent':
      return {
        precision: Number.isInteger(o.precision) ? Math.min(Math.max(o.precision, 0), 8) : 0,
      };
    case 'rating':
      return {
        max: Number.isInteger(o.max) ? Math.min(Math.max(o.max, 1), 10) : 5,
      };
    case 'date':
      return {
        includeTime: !!o.includeTime,
        ...(Number.isInteger(o.reminderDays) && o.reminderDays > 0 ? { reminderDays: Math.min(o.reminderDays, 365) } : {}),
      };
    case 'person':
      return { multiple: !!o.multiple };
    case 'link': {
      const out: Record<string, unknown> = {
        targetTableId: typeof o.targetTableId === 'string' ? o.targetTableId : '',
        multiple: !!o.multiple,
      };
      if (typeof o.displayFieldId === 'string' && o.displayFieldId) out.displayFieldId = o.displayFieldId;
      if (typeof o.reverseFieldId === 'string' && o.reverseFieldId) out.reverseFieldId = o.reverseFieldId;
      return out as Prisma.InputJsonValue;
    }
    default:
      return undefined; // text | longText | checkbox | url | email | phone | totp | password have no options
  }
}

// ---- Access guards --------------------------------------------------------
// Each guard enforces BOTH org isolation AND per-base access. A user may reach a
// base when: they're an admin, OR the base is org-visible (visibility != 'restricted'),
// OR they created it, OR they're an explicit BaseMember. Returns the resource or null.
// (Names kept as *ForOrg for call-site stability; they are now access-aware.)
type BaseAccess = { id: string; orgId: string; visibility: string; createdById: string | null };
const baseSel = { id: true, orgId: true, visibility: true, createdById: true };

export type BaseLevel = 'none' | 'viewer' | 'editor' | 'admin';
export interface BasePerm {
  level: BaseLevel;
  hiddenFields: string[];
}
const RANK: Record<BaseLevel, number> = { none: 0, viewer: 1, editor: 2, admin: 3 };
/** True if `level` meets/exceeds `min` (none < viewer < editor < admin). */
export const atLeast = (level: BaseLevel, min: BaseLevel) => RANK[level] >= RANK[min];

/**
 * A user's permission on a base: admin (workspace-admin OR base creator),
 * else their explicit BaseMember role, else org-visible → editor, else none.
 * `hiddenFields` (per-member column hiding) is empty for admins/org-visible.
 */
export async function basePermission(base: BaseAccess, orgId: string, session: Session): Promise<BasePerm> {
  if (base.orgId !== orgId) return { level: 'none', hiddenFields: [] };
  if (session.user.role === 'admin' || base.createdById === session.user.id) {
    return { level: 'admin', hiddenFields: [] };
  }
  const m = await prisma.baseMember.findUnique({
    where: { baseId_userId: { baseId: base.id, userId: session.user.id } },
    select: { role: true, hiddenFields: true },
  });
  if (m) {
    const level: BaseLevel = m.role === 'viewer' || m.role === 'admin' ? m.role : 'editor';
    const hiddenFields = Array.isArray(m.hiddenFields)
      ? (m.hiddenFields as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    return { level, hiddenFields };
  }
  if (base.visibility !== 'restricted') return { level: 'editor', hiddenFields: [] };
  return { level: 'none', hiddenFields: [] };
}

export async function canAccessBase(base: BaseAccess, orgId: string, session: Session): Promise<boolean> {
  return (await basePermission(base, orgId, session)).level !== 'none';
}

/** Write gate: returns a 403 Response if the user's level is below `min`, else null. */
export async function gate(base: BaseAccess, orgId: string, session: Session, min: BaseLevel): Promise<Response | null> {
  const perm = await basePermission(base, orgId, session);
  return atLeast(perm.level, min) ? null : jsonError('forbidden', 403);
}

// ---- Table-level ownership -------------------------------------------------
// A table's owner (`Table.createdById`) manages THAT table — rename, delete,
// structure (fields), and transfer — even when they're only a base `editor`.
// Base-admins (workspace-admin / base creator / base-admin member) still
// supersede everyone. Read access (who SEES the table) stays base-level: this
// only elevates write/manage rights, so there are no private tables.
type TableOwner = { createdById?: string | null };

/** Effective permission on a single table: the base level, bumped to `admin` for the table owner. */
export async function tablePermission(table: TableOwner, base: BaseAccess, orgId: string, session: Session): Promise<BaseLevel> {
  const perm = await basePermission(base, orgId, session);
  if (perm.level === 'admin') return 'admin';
  if (table.createdById && table.createdById === session.user.id) return 'admin';
  return perm.level;
}

/** Write gate that also grants a table's owner full rights on that table. */
export async function gateTable(table: TableOwner, base: BaseAccess, orgId: string, session: Session, min: BaseLevel): Promise<Response | null> {
  const level = await tablePermission(table, base, orgId, session);
  return atLeast(level, min) ? null : jsonError('forbidden', 403);
}

/**
 * Ownership transfer is stricter than admin: only the CURRENT owner or a
 * workspace admin may hand a base/table to someone else (a base-admin *member*
 * can manage but not give away what they don't own).
 */
export function canTransferBase(base: { createdById?: string | null }, session: Session): boolean {
  return session.user.role === 'admin' || (!!base.createdById && base.createdById === session.user.id);
}
export function canTransferTable(table: TableOwner, base: BaseAccess, session: Session): boolean {
  return session.user.role === 'admin' || base.createdById === session.user.id || (!!table.createdById && table.createdById === session.user.id);
}

/** Drop hidden-field keys from a row data object (per-member column hiding). */
export function stripHidden<T extends Record<string, unknown>>(data: T, hidden: string[]): T {
  if (!hidden.length) return data;
  const out = { ...data };
  for (const h of hidden) delete out[h];
  return out;
}

export async function baseForOrg(baseId: string, orgId: string, session: Session) {
  const base = await prisma.base.findUnique({ where: { id: baseId } });
  return base && (await canAccessBase(base, orgId, session)) ? base : null;
}

// `system` tables (e.g. the per-org Tasks table) are app-managed and must NEVER
// be reachable through the GENERIC base/row/table API — their rows carry their
// own per-resource authorization (tasks: userCanViewTask, via /api/tasks). The
// generic engine grants org-visible bases 'editor' to every member, which would
// bypass that, so these guards refuse system tables outright (→ 404).
export async function tableForOrg(tableId: string, orgId: string, session: Session) {
  const t = await prisma.table.findUnique({
    where: { id: tableId },
    include: { base: { select: baseSel } },
  });
  return t && !t.system && (await canAccessBase(t.base, orgId, session)) ? t : null;
}

export async function fieldForOrg(fieldId: string, orgId: string, session: Session) {
  const f = await prisma.field.findUnique({
    where: { id: fieldId },
    include: { table: { select: { id: true, system: true, createdById: true, primaryFieldId: true, base: { select: baseSel } } } },
  });
  return f && !f.table.system && (await canAccessBase(f.table.base, orgId, session)) ? f : null;
}

export async function rowForOrg(rowId: string, orgId: string, session: Session) {
  const row = await prisma.row.findUnique({
    where: { id: rowId },
    include: { table: { select: { id: true, system: true, base: { select: baseSel } } } },
  });
  return row && !row.table.system && (await canAccessBase(row.table.base, orgId, session)) ? row : null;
}

export async function viewForOrg(viewId: string, orgId: string, session: Session) {
  const v = await prisma.view.findUnique({
    where: { id: viewId },
    include: { table: { select: { id: true, system: true, base: { select: baseSel } } } },
  });
  return v && !v.table.system && (await canAccessBase(v.table.base, orgId, session)) ? v : null;
}
