import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

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

// ---- Org access guards ----------------------------------------------------
// Each returns the resource if it belongs to `orgId`, else null.

export async function baseForOrg(baseId: string, orgId: string) {
  const base = await prisma.base.findUnique({ where: { id: baseId } });
  return base && base.orgId === orgId ? base : null;
}

export async function tableForOrg(tableId: string, orgId: string) {
  const t = await prisma.table.findUnique({
    where: { id: tableId },
    include: { base: { select: { orgId: true } } },
  });
  return t && t.base.orgId === orgId ? t : null;
}

export async function fieldForOrg(fieldId: string, orgId: string) {
  const f = await prisma.field.findUnique({
    where: { id: fieldId },
    include: { table: { select: { id: true, primaryFieldId: true, base: { select: { orgId: true } } } } },
  });
  return f && f.table.base.orgId === orgId ? f : null;
}

export async function rowForOrg(rowId: string, orgId: string) {
  const row = await prisma.row.findUnique({
    where: { id: rowId },
    include: { table: { select: { id: true, base: { select: { orgId: true } } } } },
  });
  return row && row.table.base.orgId === orgId ? row : null;
}

export async function viewForOrg(viewId: string, orgId: string) {
  const v = await prisma.view.findUnique({
    where: { id: viewId },
    include: { table: { select: { id: true, base: { select: { orgId: true } } } } },
  });
  return v && v.table.base.orgId === orgId ? v : null;
}
