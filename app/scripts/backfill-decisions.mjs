/**
 * backfill-decisions.mjs — populate the Decisions registry from a meeting's
 * ALREADY-STORED report, WITHOUT regenerating it.
 *
 * Normally decisions land in the registry as a side effect of regenerating a
 * report (src/lib/regenerate.ts), which also rewrites the report + re-derives
 * AI tasks. This script does ONLY the decision-persistence half: it reads the
 * existing `MeetingReport.topics[].decisions[]`, provisions the per-org system
 * "Decisions" table (idempotent — byte-identical to
 * src/lib/system-decisions-table.ts via the shared fields.json), resolves each
 * decision's owner NAME → a registered participant userId (the same
 * substring-match rule as regenerate.ts::matchParticipant), and writes the
 * decision Rows. It NEVER touches MeetingReport, Task*, TaskRow or any other
 * table — the meeting's report and tasks are left exactly as-is.
 *
 * Idempotent per meeting: it delete-then-inserts the meeting's source='ai'
 * decision Rows (same as regenerate), so re-running just refreshes them.
 *
 * Usage (run where @prisma/client + DATABASE_URL exist — i.e. the app container):
 *   node scripts/backfill-decisions.mjs --list                 # recent reported meetings + decision counts
 *   node scripts/backfill-decisions.mjs --dry-run              # latest reported meeting: show, write nothing
 *   node scripts/backfill-decisions.mjs --meeting <id> --dry-run
 *   node scripts/backfill-decisions.mjs                        # latest reported meeting: WRITE
 *   node scripts/backfill-decisions.mjs --meeting <id>         # specific meeting: WRITE
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();
const SPEC = JSON.parse(readFileSync(new URL('../src/lib/system-decisions.fields.json', import.meta.url)));

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const LIST = argv.includes('--list');
const mIdx = argv.indexOf('--meeting');
const MEETING_ARG = mIdx >= 0 ? argv[mIdx + 1] : null;

/** Mirror of src/lib/system-decisions-table.ts::provisionSystemDecisionsTable. */
async function provisionDecisions(orgId) {
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
          data: { tableId: table.id, name: fld.name, type: fld.type, position, ...(fld.options != null ? { options: fld.options } : {}) },
          select: { id: true },
        });
        fid = created.id;
        byName.set(fld.name, fid);
      }
      fieldIds[fld.key] = fid;
    }
    if (table.primaryFieldId !== fieldIds.text) {
      await tx.table.update({ where: { id: table.id }, data: { primaryFieldId: fieldIds.text } });
    }
    const visible = ['text', 'owner', 'date'].map((k) => fieldIds[k]);
    const viewConfigs = {
      grid: { visibleFieldIds: visible, filters: [], sorts: [] },
      calendar: { calendarDateFieldId: fieldIds.date, filters: [], sorts: [] },
    };
    const existViews = await tx.view.findMany({ where: { tableId: table.id }, select: { id: true, name: true } });
    const vByName = new Map(existViews.map((v) => [v.name, v.id]));
    for (const vw of SPEC.views) {
      if (!vByName.has(vw.name)) {
        const position = await tx.view.count({ where: { tableId: table.id } });
        await tx.view.create({ data: { tableId: table.id, name: vw.name, type: vw.type, config: viewConfigs[vw.key], position } });
      }
    }
    return { tableId: table.id, fieldIds };
  });
}

/** The latest meeting that has a report (scheduledAt desc, then report recency). */
async function latestReportedMeeting() {
  const reports = await prisma.meetingReport.findMany({
    select: { meetingId: true, generatedAt: true, meeting: { select: { id: true, title: true, scheduledAt: true, orgId: true } } },
    orderBy: { generatedAt: 'desc' },
    take: 50,
  });
  const seen = new Set();
  const meetings = [];
  for (const r of reports) {
    if (!r.meeting || seen.has(r.meetingId)) continue;
    seen.add(r.meetingId);
    meetings.push({ ...r.meeting, reportGeneratedAt: r.generatedAt });
  }
  meetings.sort((a, b) => {
    const sa = a.scheduledAt ? a.scheduledAt.getTime() : 0;
    const sb = b.scheduledAt ? b.scheduledAt.getTime() : 0;
    if (sa !== sb) return sb - sa;
    return b.reportGeneratedAt.getTime() - a.reportGeneratedAt.getTime();
  });
  return meetings;
}

/** Flatten decisions from a report's topics → [{ text, owner }]. */
function decisionsFromTopics(topics) {
  if (!Array.isArray(topics)) return [];
  const out = [];
  for (const t of topics) {
    const ds = Array.isArray(t?.decisions) ? t.decisions : [];
    for (const d of ds) {
      const text = typeof d?.text === 'string' ? d.text.trim() : '';
      if (!text) continue;
      out.push({ text, owner: typeof d?.owner === 'string' ? d.owner.trim() : null });
    }
  }
  return out;
}

/** Registered participants of a meeting → [{ id, name }] (the safe owner-match set). */
async function registeredAttendees(meetingId) {
  const rows = await prisma.meetingParticipant.findMany({
    where: { meetingId, userId: { not: null } },
    select: { user: { select: { id: true, name: true } } },
  });
  const byId = new Map();
  for (const r of rows) if (r.user) byId.set(r.user.id, { id: r.user.id, name: r.user.name || '' });
  return [...byId.values()];
}

/** matchParticipant rule (regenerate.ts): case-insensitive substring, either direction. */
function matchOwnerId(ownerName, attendees) {
  if (!ownerName) return null;
  const n = ownerName.trim().toLowerCase();
  if (!n) return null;
  for (const a of attendees) {
    const an = (a.name || '').toLowerCase();
    if (an && (an.includes(n) || n.includes(an))) return a.id;
  }
  return null;
}

async function run() {
  if (LIST) {
    const meetings = await latestReportedMeeting();
    console.log(`[list] ${meetings.length} reported meeting(s) (newest first):\n`);
    for (const m of meetings.slice(0, 12)) {
      const report = await prisma.meetingReport.findFirst({ where: { meetingId: m.id }, orderBy: { generatedAt: 'desc' }, select: { topics: true } });
      const decs = decisionsFromTopics(report?.topics);
      const when = m.scheduledAt ? m.scheduledAt.toISOString().slice(0, 16).replace('T', ' ') : '—';
      console.log(`  ${m.id}  ${when}  decisions=${decs.length}  "${(m.title || '').slice(0, 50)}"`);
    }
    return;
  }

  // Resolve target meeting
  let meeting;
  if (MEETING_ARG) {
    meeting = await prisma.meeting.findUnique({ where: { id: MEETING_ARG }, select: { id: true, title: true, scheduledAt: true, orgId: true } });
    if (!meeting) throw new Error(`Meeting not found: ${MEETING_ARG}`);
  } else {
    const meetings = await latestReportedMeeting();
    if (!meetings.length) throw new Error('No reported meetings found.');
    meeting = meetings[0];
  }

  const report = await prisma.meetingReport.findFirst({ where: { meetingId: meeting.id }, orderBy: { generatedAt: 'desc' }, select: { id: true, topics: true, generatedAt: true } });
  if (!report) throw new Error(`Meeting ${meeting.id} has no report — nothing to backfill.`);

  const decisions = decisionsFromTopics(report.topics);
  const attendees = await registeredAttendees(meeting.id);
  const dateIso = (meeting.scheduledAt ?? report.generatedAt ?? new Date()).toISOString();

  console.log(`[target] meeting ${meeting.id}  "${(meeting.title || '').slice(0, 60)}"`);
  console.log(`[target] org=${meeting.orgId}  report=${report.id}  date=${dateIso}`);
  console.log(`[target] ${decisions.length} decision(s) in the stored report; ${attendees.length} registered attendee(s)\n`);
  if (!decisions.length) { console.log('Nothing to do (report has no decisions).'); return; }

  let resolvedOwners = 0;
  const prepared = decisions.map((d, i) => {
    const ownerId = matchOwnerId(d.owner, attendees);
    if (ownerId) resolvedOwners += 1;
    console.log(`  ${String(i + 1).padStart(2, '0')}. ${ownerId ? '[owner→' + ownerId.slice(0, 8) + '] ' : d.owner ? '[owner?"' + d.owner + '"→null] ' : '[no owner] '}${d.text.slice(0, 90)}`);
    return { text: d.text, ownerId };
  });
  console.log(`\n[owners] resolved ${resolvedOwners}/${decisions.length} owner name(s) to registered users (rest → null).`);

  if (DRY) {
    console.log(`\n[dry-run] would provision the Decisions table (if absent) and replace this meeting's source='ai' decision Rows with ${decisions.length} row(s). No writes performed.`);
    return;
  }

  const { tableId, fieldIds: f } = await provisionDecisions(meeting.orgId);

  // Idempotent: drop this meeting's existing AI decision Rows, then insert (matches regenerate.ts).
  const del = await prisma.row.deleteMany({
    where: { tableId, AND: [{ data: { path: [f.meetingId], equals: meeting.id } }, { data: { path: [f.source], equals: 'ai' } }] },
  });
  console.log(`[write] deleted ${del.count} pre-existing AI decision Row(s) for this meeting.`);

  let inserted = 0;
  for (const d of prepared) {
    const data = {
      [f.text]: d.text,
      ...(d.ownerId ? { [f.owner]: d.ownerId } : {}),
      [f.date]: dateIso,
      [f.meetingId]: meeting.id,
      [f.reportId]: report.id,
      [f.source]: 'ai',
    };
    await prisma.row.create({ data: { tableId, data, position: 0 } });
    inserted += 1;
  }
  console.log(`[write] inserted ${inserted} decision Row(s) into the Decisions table (${tableId}).`);
  console.log(`[done] MeetingReport, tasks and TaskRow were NOT touched.`);
}

run()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
