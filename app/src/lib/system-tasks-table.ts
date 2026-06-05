import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import spec from './system-tasks.fields.json';

/**
 * System "Tasks" table provisioning (Phase 3.0, roadmap §15).
 *
 * Tasks are being re-homed onto the generic base engine: each org gets ONE
 * system Base → Table ("Tasks", `Table.system=true`) whose Fields model the
 * task shape (title/description/status/priority/dueDate/assignee). Task Rows
 * then live in this table; structural app-entity FKs go in the `TaskRow`
 * sidecar (not here). This module only find-or-creates that scaffold.
 *
 * The field shapes + pinned choice ids come from `system-tasks.fields.json`,
 * the SINGLE source of truth shared with the 3.1 backfill script
 * (`scripts/migrate-tasks-to-rows.mjs`) so the two can never drift.
 *
 * NODE/SERVER-ONLY (imports prisma). It performs DATA-level work only — it
 * never runs `prisma db push`. The `Table.system` column + the Row* / TaskRow
 * tables are applied to prod via raw SQL FIRST (see the Phase-3.0 deploy), so
 * calling this after the schema is live is safe.
 *
 * IDEMPOTENT: keyed by STABLE NAMES (cuid ids differ per org). A second call
 * for an org that already has the Tasks table issues only SELECTs and returns
 * the identical ids — nothing is deleted or re-created. Create-only by design:
 * it does NOT reconcile drift in existing field types/options (that would need
 * a separate explicit migration).
 */

export const SYSTEM_TASKS_BASE_NAME = spec.baseName;
export const SYSTEM_TASKS_TABLE_NAME = spec.tableName;

export type TaskFieldKey = 'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'assignee';

/** Stable, English canonical field names (UI localizes labels, not the data). */
export const TASK_FIELD_NAMES = spec.fieldNames as Record<TaskFieldKey, string>;

/**
 * Status choice ids are PINNED to the literal `MeetingTask.status` strings so
 * the 3.1 backfill copies status verbatim into `Row.data[statusFieldId]` with
 * no remap and the kanban Board stacks on them. Do NOT rename these ids.
 */
export const TASK_STATUS_CHOICE_IDS = spec.statusChoiceIds;
/** Priority choice ids pinned to the literal `MeetingTask.priority` strings. */
export const TASK_PRIORITY_CHOICE_IDS = spec.priorityChoiceIds;

export type TaskFieldSpec = {
  key: TaskFieldKey;
  name: string;
  type: string;
  options: Prisma.InputJsonValue | null;
};

/** The standard Fields, in creation order (Title first → becomes primary). */
export const TASK_FIELD_SPECS = spec.fields as TaskFieldSpec[];

export type TaskFieldIds = Record<TaskFieldKey, string>;

export type SystemTasksProvision = {
  base: { id: string };
  table: { id: string; primaryFieldId: string | null };
  fieldIds: TaskFieldIds;
  views: { grid: string; board: string; calendar: string };
};

type ViewKey = keyof SystemTasksProvision['views'];
const VIEW_SPECS = spec.views as { key: ViewKey; name: string; type: string }[];

/**
 * Find-or-create the per-org system Tasks Base → Table → Fields → Views.
 * Wrapped in a single transaction so a half-provision can't persist. Returns
 * the resolved ids. Re-running is a no-op (only SELECTs).
 */
export async function provisionSystemTasksTable(orgId: string): Promise<SystemTasksProvision> {
  if (!orgId) throw new Error('provisionSystemTasksTable: orgId is required');

  return prisma.$transaction(async (tx) => {
    // STEP 1 — Base (one "Tasks" base per org; system-owned: null creator).
    let base = await tx.base.findFirst({
      where: { orgId, name: SYSTEM_TASKS_BASE_NAME },
      select: { id: true },
    });
    if (!base) {
      const position = await tx.base.count({ where: { orgId } });
      base = await tx.base.create({
        data: {
          orgId,
          name: SYSTEM_TASKS_BASE_NAME,
          icon: spec.icon,
          visibility: 'org',
          createdById: null,
          position,
        },
        select: { id: true },
      });
    }

    // STEP 2 — Table (system=true → not user-deletable; Tasks nav targets it).
    let table = await tx.table.findFirst({
      where: { baseId: base.id, system: true, name: SYSTEM_TASKS_TABLE_NAME },
      select: { id: true, primaryFieldId: true },
    });
    if (!table) {
      const position = await tx.table.count({ where: { baseId: base.id } });
      table = await tx.table.create({
        data: { baseId: base.id, name: SYSTEM_TASKS_TABLE_NAME, icon: spec.icon, system: true, position },
        select: { id: true, primaryFieldId: true },
      });
    }

    // STEP 3 — Fields by stable name (create-only; reuse existing).
    const existingFields = await tx.field.findMany({
      where: { tableId: table.id },
      select: { id: true, name: true },
    });
    const fieldByName = new Map(existingFields.map((f) => [f.name, f.id]));
    const fieldIds = {} as TaskFieldIds;
    for (const fld of TASK_FIELD_SPECS) {
      let fid = fieldByName.get(fld.name);
      if (!fid) {
        const position = await tx.field.count({ where: { tableId: table.id } });
        const created = await tx.field.create({
          data: {
            tableId: table.id,
            name: fld.name,
            type: fld.type,
            position,
            ...(fld.options != null ? { options: fld.options } : {}),
          },
          select: { id: true },
        });
        fid = created.id;
        fieldByName.set(fld.name, fid);
      }
      fieldIds[fld.key] = fid;
    }

    // STEP 4 — primary field → Title (conditional, so a re-run is a no-op).
    if (table.primaryFieldId !== fieldIds.title) {
      await tx.table.update({ where: { id: table.id }, data: { primaryFieldId: fieldIds.title } });
    }

    // STEP 5 — Views by stable name (Grid / Board / Calendar).
    const viewConfigs: Record<ViewKey, Prisma.InputJsonValue> = {
      grid: { visibleFieldIds: TASK_FIELD_SPECS.map((s) => fieldIds[s.key]), filters: [], sorts: [] },
      board: { kanbanStackFieldId: fieldIds.status, filters: [], sorts: [] },
      calendar: { calendarDateFieldId: fieldIds.dueDate, filters: [], sorts: [] },
    };
    const existingViews = await tx.view.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
    const viewByName = new Map(existingViews.map((v) => [v.name, v.id]));
    const views = {} as SystemTasksProvision['views'];
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

    return {
      base: { id: base.id },
      table: { id: table.id, primaryFieldId: fieldIds.title },
      fieldIds,
      views,
    };
  });
}

/**
 * Read-only resolver: returns the org's system Tasks scaffold, or `null` if it
 * has not been provisioned (or is incomplete). NEVER creates anything — use it
 * on GET read paths (calendar / ICS / dashboard) so a read can't accidentally
 * provision. Callers that need the scaffold to exist call provision* instead.
 */
export async function getSystemTasksTable(orgId: string): Promise<SystemTasksProvision | null> {
  if (!orgId) return null;
  const base = await prisma.base.findFirst({
    where: { orgId, name: SYSTEM_TASKS_BASE_NAME },
    select: { id: true },
  });
  if (!base) return null;
  const table = await prisma.table.findFirst({
    where: { baseId: base.id, system: true, name: SYSTEM_TASKS_TABLE_NAME },
    select: { id: true, primaryFieldId: true },
  });
  if (!table) return null;

  const fields = await prisma.field.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
  const fieldByName = new Map(fields.map((f) => [f.name, f.id]));
  const fieldIds = {} as TaskFieldIds;
  for (const fld of TASK_FIELD_SPECS) {
    const fid = fieldByName.get(fld.name);
    if (!fid) return null; // incomplete → treat as not provisioned
    fieldIds[fld.key] = fid;
  }

  const dbViews = await prisma.view.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
  const viewByName = new Map(dbViews.map((v) => [v.name, v.id]));
  const views = {} as SystemTasksProvision['views'];
  for (const vw of VIEW_SPECS) {
    const vid = viewByName.get(vw.name);
    if (!vid) return null;
    views[vw.key] = vid;
  }

  return {
    base: { id: base.id },
    table: { id: table.id, primaryFieldId: table.primaryFieldId },
    fieldIds,
    views,
  };
}
