/**
 * Phase 3.1 — backfill MeetingTask → base-engine Rows (roadmap §15).
 *
 * Re-homes every MeetingTask onto the per-org system "Tasks" table as a Row,
 * keeping the SAME id (so `?task=ID` deep-links, notification refs and on-disk
 * attachment paths stay valid), with structural FKs in the `TaskRow` sidecar.
 * The collaboration rows (comments/attachments/collaborators/assignments) are
 * copied to their Row* equivalents, also same-id.
 *
 *   MeetingTask        → Row (same id) + TaskRow (same rowId)
 *   TaskComment        → RowComment      (same id)
 *   TaskAttachment     → RowAttachment   (same id, filePath UNCHANGED)
 *   TaskCollaborator   → RowCollaborator (same id)
 *   TaskAssignment     → RowAssignment   (same id) + assignee person cell
 *
 * Field shapes + pinned choice ids come from ../src/lib/system-tasks.fields.json
 * — the SAME source the app's provisioner (src/lib/system-tasks-table.ts) uses,
 * so the table this script provisions is byte-identical to the app's.
 *
 * IDEMPOTENT: every write is an upsert keyed by the SAME id, so re-running only
 * updates. ADDITIVE: MeetingTask + Task* are left untouched (the app still reads
 * them until the 3.2 cutover); this script just populates the parallel Row world.
 *
 * RUN ORDER (mirrors Phase-1 discipline):
 *   1) apply the 3.0 raw-SQL on prod (Table.system + the Row-collab and TaskRow tables)
 *   2) deploy the 3.0 app code
 *   3) node scripts/migrate-tasks-to-rows.mjs --dry-run   # counts only, no writes
 *   4) node scripts/migrate-tasks-to-rows.mjs             # backfill
 *   5) (3.2) cut the app over to read Row+TaskRow
 *
 * Flags:
 *   --dry-run    report what WOULD change; write nothing (no provisioning)
 *   --rollback   delete the migrated Rows (cascades to TaskRow/Row*); Task* stay
 *
 * Run where @prisma/client + DATABASE_URL are available (the app/build context):
 *   DATABASE_URL=... node scripts/migrate-tasks-to-rows.mjs --dry-run
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();
const SPEC = JSON.parse(readFileSync(new URL('../src/lib/system-tasks.fields.json', import.meta.url)));

const DRY = process.argv.includes('--dry-run');
const ROLLBACK = process.argv.includes('--rollback');
const PAGE = 500;

/**
 * Find-or-create the per-org system Tasks scaffold from SPEC. Mirrors
 * src/lib/system-tasks-table.ts::provisionSystemTasksTable (kept in lockstep via
 * the shared JSON). Idempotent: stable-name lookups, create-if-absent only.
 */
async function provisionForOrg(orgId) {
  return prisma.$transaction(async (tx) => {
    let base = await tx.base.findFirst({ where: { orgId, name: SPEC.baseName }, select: { id: true } });
    if (!base) {
      const position = await tx.base.count({ where: { orgId } });
      base = await tx.base.create({
        data: { orgId, name: SPEC.baseName, icon: SPEC.icon, visibility: 'org', createdById: null, position },
        select: { id: true },
      });
    }

    let table = await tx.table.findFirst({
      where: { baseId: base.id, system: true, name: SPEC.tableName },
      select: { id: true, primaryFieldId: true },
    });
    if (!table) {
      const position = await tx.table.count({ where: { baseId: base.id } });
      table = await tx.table.create({
        data: { baseId: base.id, name: SPEC.tableName, icon: SPEC.icon, system: true, position },
        select: { id: true, primaryFieldId: true },
      });
    }

    const existing = await tx.field.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
    const byName = new Map(existing.map((f) => [f.name, f.id]));
    const fieldIds = {};
    for (const fld of SPEC.fields) {
      let fid = byName.get(fld.name);
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
        byName.set(fld.name, fid);
      }
      fieldIds[fld.key] = fid;
    }

    if (table.primaryFieldId !== fieldIds.title) {
      await tx.table.update({ where: { id: table.id }, data: { primaryFieldId: fieldIds.title } });
    }

    const viewConfigs = {
      grid: { visibleFieldIds: SPEC.fields.map((s) => fieldIds[s.key]), filters: [], sorts: [] },
      board: { kanbanStackFieldId: fieldIds.status, filters: [], sorts: [] },
      calendar: { calendarDateFieldId: fieldIds.dueDate, filters: [], sorts: [] },
    };
    const existViews = await tx.view.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
    const vByName = new Map(existViews.map((v) => [v.name, v.id]));
    for (const vw of SPEC.views) {
      if (!vByName.has(vw.name)) {
        const position = await tx.view.count({ where: { tableId: table.id } });
        await tx.view.create({
          data: { tableId: table.id, name: vw.name, type: vw.type, config: viewConfigs[vw.key], position },
        });
      }
    }

    return { tableId: table.id, fieldIds };
  });
}

/** Build the Row.data cell-bag in the exact shapes base-rows.ts::coerceCell stores. */
function buildRowData(t, f, assigneeIds) {
  const data = {};
  data[f.title] = t.title || '';
  if (t.description) data[f.description] = t.description; // longText → string
  if (t.status) data[f.status] = t.status; // singleSelect → pinned choice id
  if (t.priority) data[f.priority] = t.priority; // singleSelect → pinned choice id
  if (t.dueDate) data[f.dueDate] = new Date(t.dueDate).toISOString(); // date → ISO string
  if (assigneeIds.length) data[f.assignee] = assigneeIds; // person(multiple) → string[]
  return data;
}

async function distinctTaskOrgIds() {
  const rows = await prisma.meetingTask.findMany({ distinct: ['orgId'], select: { orgId: true } });
  return rows.map((r) => r.orgId).filter(Boolean);
}

async function migrate() {
  const orgIds = await distinctTaskOrgIds();
  console.log(`[provision] ${orgIds.length} org(s) with tasks`);
  const provByOrg = new Map();
  for (const orgId of orgIds) provByOrg.set(orgId, await provisionForOrg(orgId));

  const c = { rows: 0, taskRows: 0, comments: 0, attachments: 0, collaborators: 0, assignments: 0, skipped: 0 };
  let cursor;
  for (;;) {
    const tasks = await prisma.meetingTask.findMany({
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      include: {
        assignees: { select: { id: true, userId: true, createdAt: true } },
        comments: true,
        attachments: true,
        collaborators: true,
      },
    });
    if (!tasks.length) break;
    cursor = tasks[tasks.length - 1].id;

    for (const t of tasks) {
      const prov = provByOrg.get(t.orgId);
      if (!prov) { c.skipped++; continue; }
      const f = prov.fieldIds;
      const assigneeIds = t.assignees.length
        ? t.assignees.map((a) => a.userId)
        : t.assigneeId
          ? [t.assigneeId]
          : [];
      const data = buildRowData(t, f, assigneeIds);

      await prisma.row.upsert({
        where: { id: t.id },
        create: { id: t.id, tableId: prov.tableId, data, createdById: null, position: t.sortOrder ?? 0, createdAt: t.createdAt },
        update: { tableId: prov.tableId, data, position: t.sortOrder ?? 0 },
      });
      c.rows++;

      await prisma.taskRow.upsert({
        where: { rowId: t.id },
        create: {
          rowId: t.id,
          meetingId: t.meetingId,
          reportId: t.reportId,
          departmentId: t.departmentId,
          parentRowId: t.parentId,
          source: t.source,
          completedAt: t.completedAt,
          createdAt: t.createdAt,
        },
        update: {
          meetingId: t.meetingId,
          reportId: t.reportId,
          departmentId: t.departmentId,
          parentRowId: t.parentId,
          source: t.source,
          completedAt: t.completedAt,
        },
      });
      c.taskRows++;

      for (const cm of t.comments) {
        await prisma.rowComment.upsert({
          where: { id: cm.id },
          create: { id: cm.id, rowId: t.id, userId: cm.userId, authorName: cm.authorName, body: cm.body, createdAt: cm.createdAt },
          update: { rowId: t.id, userId: cm.userId, authorName: cm.authorName, body: cm.body },
        });
        c.comments++;
      }

      for (const a of t.attachments) {
        await prisma.rowAttachment.upsert({
          where: { id: a.id },
          create: { id: a.id, rowId: t.id, fileName: a.fileName, filePath: a.filePath, mimeType: a.mimeType, fileSize: a.fileSize, uploadedById: a.uploadedById, createdAt: a.createdAt },
          update: { rowId: t.id, fileName: a.fileName, filePath: a.filePath, mimeType: a.mimeType, fileSize: a.fileSize, uploadedById: a.uploadedById },
        });
        c.attachments++;
      }

      for (const co of t.collaborators) {
        await prisma.rowCollaborator.upsert({
          where: { id: co.id },
          create: { id: co.id, rowId: t.id, userId: co.userId, createdAt: co.createdAt },
          update: { rowId: t.id, userId: co.userId },
        });
        c.collaborators++;
      }

      for (const as of t.assignees) {
        await prisma.rowAssignment.upsert({
          where: { id: as.id },
          create: { id: as.id, rowId: t.id, userId: as.userId, createdAt: as.createdAt },
          update: { rowId: t.id, userId: as.userId },
        });
        c.assignments++;
      }
    }
    console.log(`[migrate] …${c.rows} rows so far`);
  }
  return c;
}

async function dryRun() {
  const orgIds = await distinctTaskOrgIds();
  const [tasks, comments, attachments, collaborators, assignments] = await Promise.all([
    prisma.meetingTask.count(),
    prisma.taskComment.count(),
    prisma.taskAttachment.count(),
    prisma.taskCollaborator.count(),
    prisma.taskAssignment.count(),
  ]);

  // How many MeetingTask ids already have a Row (i.e. previously migrated)?
  const ids = (await prisma.meetingTask.findMany({ select: { id: true } })).map((t) => t.id);
  let alreadyRows = 0;
  for (let i = 0; i < ids.length; i += PAGE) {
    alreadyRows += await prisma.row.count({ where: { id: { in: ids.slice(i, i + PAGE) } } });
  }

  console.log('[dry-run] would provision a system Tasks table for', orgIds.length, 'org(s)');
  console.log('[dry-run] would backfill:', { tasks, comments, attachments, collaborators, assignments });
  console.log('[dry-run] already-migrated Rows (same id present):', alreadyRows, '/', tasks);
  console.log('[dry-run] NO writes performed.');
}

async function rollback() {
  // Migrated Rows share their id with the MeetingTask. Deleting them cascades to
  // TaskRow + Row{Comment,Attachment,Collaborator,Assignment} (all FK rowId→Row
  // ON DELETE CASCADE). MeetingTask + Task* are untouched. The (now empty) system
  // Tasks base/table is left in place — provisioning is idempotent, so a re-run
  // reuses it. On-disk attachment files are NOT deleted (they belong to Task* too).
  const ids = (await prisma.meetingTask.findMany({ select: { id: true } })).map((t) => t.id);
  if (DRY) {
    let present = 0;
    for (let i = 0; i < ids.length; i += PAGE) {
      present += await prisma.row.count({ where: { id: { in: ids.slice(i, i + PAGE) } } });
    }
    console.log('[rollback --dry-run] would delete', present, 'migrated Row(s) (cascade to TaskRow/Row*).');
    return;
  }
  let deleted = 0;
  for (let i = 0; i < ids.length; i += PAGE) {
    const res = await prisma.row.deleteMany({ where: { id: { in: ids.slice(i, i + PAGE) } } });
    deleted += res.count;
  }
  console.log('[rollback] deleted', deleted, 'migrated Row(s).');
}

async function main() {
  const mode = ROLLBACK ? 'ROLLBACK' : DRY ? 'DRY-RUN' : 'MIGRATE';
  console.log(`[migrate-tasks-to-rows] mode=${mode}`);
  if (ROLLBACK) return rollback();
  if (DRY) return dryRun();

  const before = Date.now();
  const c = await migrate();
  console.log('[migrate] done in', Math.round((Date.now() - before) / 1000) + 's:', c);

  // Parity check: every MeetingTask should now have a Row + TaskRow.
  const tasks = await prisma.meetingTask.count();
  const rowsForTasks = await prisma.taskRow.count();
  console.log(`[verify] MeetingTask=${tasks} TaskRow=${rowsForTasks}`, tasks === rowsForTasks ? 'OK' : 'MISMATCH');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
