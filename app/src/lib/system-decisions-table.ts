import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import spec from './system-decisions.fields.json';

/**
 * System "Decisions" table provisioning (Phase 4.2, roadmap §16) — the mirror of
 * `system-tasks-table.ts` for the meeting-decisions registry.
 *
 * Each org gets ONE system Base → Table ("Decisions", `Table.system=true`) whose
 * Fields are Decision (longText) / Owner (person) / Date (date) plus three
 * STRUCTURAL fields — Meeting / Report / Source — that hold the source meeting
 * id, report id and 'ai'|'manual'. Decisions extracted from reports are stored
 * as Rows here; the structural fields (in Row.data — no sidecar, so NO prod DDL)
 * drive re-derivation on regenerate and per-decision authz (a user sees a
 * decision only if they can access its meeting). The bespoke /api/decisions
 * registry never renders the structural fields, and the engine guards hide the
 * whole system table from the generic Database UI.
 *
 * IDEMPOTENT: keyed by STABLE NAMES; a re-run issues only SELECTs and returns
 * the same ids. Create-only (does not reconcile drift in existing fields).
 */

export const SYSTEM_DECISIONS_BASE_NAME = spec.baseName;
export const SYSTEM_DECISIONS_TABLE_NAME = spec.tableName;

export type DecisionFieldKey = 'text' | 'owner' | 'date' | 'meetingId' | 'reportId' | 'source';
export const DECISION_FIELD_NAMES = spec.fieldNames as Record<DecisionFieldKey, string>;

export type DecisionFieldSpec = { key: DecisionFieldKey; name: string; type: string; options: Prisma.InputJsonValue | null };
export const DECISION_FIELD_SPECS = spec.fields as DecisionFieldSpec[];

export type DecisionFieldIds = Record<DecisionFieldKey, string>;

export type SystemDecisionsProvision = {
  base: { id: string };
  table: { id: string; primaryFieldId: string | null };
  fieldIds: DecisionFieldIds;
  views: { grid: string; calendar: string };
};

type ViewKey = keyof SystemDecisionsProvision['views'];
const VIEW_SPECS = spec.views as { key: ViewKey; name: string; type: string }[];

/** Fields the registry UI surfaces (the structural Meeting/Report/Source stay hidden). */
export const DECISION_VISIBLE_KEYS: DecisionFieldKey[] = ['text', 'owner', 'date'];

/** Find-or-create the per-org system Decisions Base → Table → Fields → Views. */
export async function provisionSystemDecisionsTable(orgId: string): Promise<SystemDecisionsProvision> {
  if (!orgId) throw new Error('provisionSystemDecisionsTable: orgId is required');

  return prisma.$transaction(async (tx) => {
    let base = await tx.base.findFirst({ where: { orgId, name: SYSTEM_DECISIONS_BASE_NAME }, select: { id: true } });
    if (!base) {
      const position = await tx.base.count({ where: { orgId } });
      base = await tx.base.create({
        data: { orgId, name: SYSTEM_DECISIONS_BASE_NAME, icon: spec.icon, visibility: 'org', createdById: null, position },
        select: { id: true },
      });
    }

    let table = await tx.table.findFirst({
      where: { baseId: base.id, system: true, name: SYSTEM_DECISIONS_TABLE_NAME },
      select: { id: true, primaryFieldId: true },
    });
    if (!table) {
      const position = await tx.table.count({ where: { baseId: base.id } });
      table = await tx.table.create({
        data: { baseId: base.id, name: SYSTEM_DECISIONS_TABLE_NAME, icon: spec.icon, system: true, position },
        select: { id: true, primaryFieldId: true },
      });
    }

    const existingFields = await tx.field.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
    const fieldByName = new Map(existingFields.map((f) => [f.name, f.id]));
    const fieldIds = {} as DecisionFieldIds;
    for (const fld of DECISION_FIELD_SPECS) {
      let fid = fieldByName.get(fld.name);
      if (!fid) {
        const position = await tx.field.count({ where: { tableId: table.id } });
        const created = await tx.field.create({
          data: { tableId: table.id, name: fld.name, type: fld.type, position, ...(fld.options != null ? { options: fld.options } : {}) },
          select: { id: true },
        });
        fid = created.id;
        fieldByName.set(fld.name, fid);
      }
      fieldIds[fld.key] = fid;
    }

    if (table.primaryFieldId !== fieldIds.text) {
      await tx.table.update({ where: { id: table.id }, data: { primaryFieldId: fieldIds.text } });
    }

    const viewConfigs: Record<ViewKey, Prisma.InputJsonValue> = {
      grid: { visibleFieldIds: DECISION_VISIBLE_KEYS.map((k) => fieldIds[k]), filters: [], sorts: [] },
      calendar: { calendarDateFieldId: fieldIds.date, filters: [], sorts: [] },
    };
    const existingViews = await tx.view.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
    const viewByName = new Map(existingViews.map((v) => [v.name, v.id]));
    const views = {} as SystemDecisionsProvision['views'];
    for (const vw of VIEW_SPECS) {
      let vid = viewByName.get(vw.name);
      if (!vid) {
        const position = await tx.view.count({ where: { tableId: table.id } });
        const created = await tx.view.create({
          data: { tableId: table.id, name: vw.name, type: vw.type, config: viewConfigs[vw.key], position },
          select: { id: true },
        });
        vid = created.id;
        viewByName.set(vw.name, vid);
      }
      views[vw.key] = vid;
    }

    return { base: { id: base.id }, table: { id: table.id, primaryFieldId: fieldIds.text }, fieldIds, views };
  });
}

/** Read-only resolver: the org's system Decisions scaffold, or null if unprovisioned/incomplete. Never creates. */
export async function getSystemDecisionsTable(orgId: string): Promise<SystemDecisionsProvision | null> {
  if (!orgId) return null;
  const base = await prisma.base.findFirst({ where: { orgId, name: SYSTEM_DECISIONS_BASE_NAME }, select: { id: true } });
  if (!base) return null;
  const table = await prisma.table.findFirst({
    where: { baseId: base.id, system: true, name: SYSTEM_DECISIONS_TABLE_NAME },
    select: { id: true, primaryFieldId: true },
  });
  if (!table) return null;

  const fields = await prisma.field.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
  const fieldByName = new Map(fields.map((f) => [f.name, f.id]));
  const fieldIds = {} as DecisionFieldIds;
  for (const fld of DECISION_FIELD_SPECS) {
    const fid = fieldByName.get(fld.name);
    if (!fid) return null;
    fieldIds[fld.key] = fid;
  }

  const dbViews = await prisma.view.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
  const viewByName = new Map(dbViews.map((v) => [v.name, v.id]));
  const views = {} as SystemDecisionsProvision['views'];
  for (const vw of VIEW_SPECS) {
    const vid = viewByName.get(vw.name);
    if (!vid) return null;
    views[vw.key] = vid;
  }

  return { base: { id: base.id }, table: { id: table.id, primaryFieldId: table.primaryFieldId }, fieldIds, views };
}
