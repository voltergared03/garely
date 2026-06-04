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
  'singleSelect',
  'multiSelect',
  'date',
  'person',
  'checkbox',
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
    case 'date':
      return { includeTime: !!o.includeTime };
    case 'person':
      return { multiple: !!o.multiple };
    default:
      return undefined; // text | longText | checkbox have no options
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

export async function tableForOrg(tableId: string, orgId: string, session: Session) {
  const t = await prisma.table.findUnique({
    where: { id: tableId },
    include: { base: { select: baseSel } },
  });
  return t && (await canAccessBase(t.base, orgId, session)) ? t : null;
}

export async function fieldForOrg(fieldId: string, orgId: string, session: Session) {
  const f = await prisma.field.findUnique({
    where: { id: fieldId },
    include: { table: { select: { id: true, primaryFieldId: true, base: { select: baseSel } } } },
  });
  return f && (await canAccessBase(f.table.base, orgId, session)) ? f : null;
}

export async function rowForOrg(rowId: string, orgId: string, session: Session) {
  const row = await prisma.row.findUnique({
    where: { id: rowId },
    include: { table: { select: { id: true, base: { select: baseSel } } } },
  });
  return row && (await canAccessBase(row.table.base, orgId, session)) ? row : null;
}

export async function viewForOrg(viewId: string, orgId: string, session: Session) {
  const v = await prisma.view.findUnique({
    where: { id: viewId },
    include: { table: { select: { id: true, base: { select: baseSel } } } },
  });
  return v && (await canAccessBase(v.table.base, orgId, session)) ? v : null;
}
