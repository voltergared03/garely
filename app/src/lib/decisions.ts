import { Prisma } from '@prisma/client';
import type { Session } from 'next-auth';
import { prisma } from './prisma';
import { mergeRowData, type FieldLike } from './base-rows';
import { getSystemDecisionsTable, type DecisionFieldIds } from './system-decisions-table';
import { getCurrentOrgId } from './org';

/**
 * Decisions registry adapter (Phase 4.2, roadmap §16) — the single read/write
 * layer for the meeting-decisions registry. Decisions are base-engine Rows in
 * the per-org system "Decisions" table; their structural Meeting/Report/Source
 * fields live in `Row.data` (no sidecar — no prod DDL). The generic base/row
 * APIs refuse system tables (the 3.2 guard), so this bespoke adapter + the
 * `/api/decisions*` routes are the ONLY way to reach them — exactly mirroring
 * how `lib/tasks.ts` + `/api/tasks` shield the system Tasks table.
 *
 * Authz model:
 *  • VIEW — a user sees a decision only if they can access its source meeting
 *    (creator or participant); admins see all. Applied in BULK in listDecisions.
 *  • EDIT/DELETE — admin OR the source meeting's CREATOR (stricter than view, so
 *    a random participant can't rewrite/delete the team's record). Surfaced to
 *    the client as `canEdit` per decision and re-checked on every mutation.
 * Tenant isolation comes entirely from scoping every query to the org's single
 * system Decisions `tableId`.
 */

type UserLite = { id: string; name: string | null; image: string | null };
type Cells = Record<string, unknown>;
type MeetingLite = { id: string; title: string; scheduledAt: Date | null; createdById: string | null };

export type DecisionViewer = { userId: string | null; isAdmin: boolean };

export type DecisionDTO = {
  id: string;
  text: string;
  date: string | null;
  ownerId: string | null;
  owner: UserLite | null;
  meetingId: string | null;
  reportId: string | null;
  source: string;
  meeting: { id: string; title: string; scheduledAt: string | null } | null;
  /** May the viewer edit/delete this decision (admin or the meeting's creator)? */
  canEdit: boolean;
  createdAt: string;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);

/** Owner is a `person` (multiple:false) → a single string id; read defensively. */
function ownerIdOf(data: Cells, ownerFieldId: string): string | null {
  const v = data[ownerFieldId];
  if (typeof v === 'string' && v) return v;
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0]) return v[0];
  return null;
}

function canEditDecision(meeting: MeetingLite | null | undefined, viewer: DecisionViewer): boolean {
  if (viewer.isAdmin) return true;
  if (!viewer.userId) return false;
  return !!meeting && meeting.createdById === viewer.userId;
}

type DecisionRow = { id: string; data: Prisma.JsonValue; createdAt: Date };

/** Pure projector: Row + batched owner/meeting maps + viewer → DecisionDTO. */
export function assembleDecisionDTO(
  row: DecisionRow,
  df: DecisionFieldIds,
  owners: Map<string, UserLite>,
  meetings: Map<string, MeetingLite>,
  viewer: DecisionViewer = { userId: null, isAdmin: false },
): DecisionDTO {
  const data = (row.data ?? {}) as Cells;
  const ownerId = ownerIdOf(data, df.owner);
  const meetingId = str(data[df.meetingId]);
  const m = meetingId ? meetings.get(meetingId) ?? null : null;
  return {
    id: row.id,
    text: str(data[df.text]) ?? '',
    date: str(data[df.date]),
    ownerId,
    owner: ownerId ? owners.get(ownerId) ?? null : null,
    meetingId,
    reportId: str(data[df.reportId]),
    source: str(data[df.source]) ?? 'ai',
    meeting: m ? { id: m.id, title: m.title, scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null } : null,
    canEdit: canEditDecision(m, viewer),
    createdAt: row.createdAt.toISOString(),
  };
}

export type ListDecisionParams = {
  meetingId?: string | null;
  owner?: string | null; // a userId
  q?: string | null;
};

/**
 * List the decisions the session user may see, newest first. The access gate
 * runs BEFORE the filters, so a passed `meetingId` can only narrow within
 * already-visible decisions. Filters are applied app-side over the small
 * per-org set (base-rows v1 philosophy).
 */
export async function listDecisions(session: Session, params: ListDecisionParams = {}): Promise<DecisionDTO[]> {
  const orgId = await getCurrentOrgId(session);
  if (!orgId) return [];
  const prov = await getSystemDecisionsTable(orgId);
  if (!prov) return [];
  const df = prov.fieldIds;
  const userId = session.user.id;
  const isAdmin = session.user.role === 'admin';
  const viewer: DecisionViewer = { userId, isAdmin };

  let rows: DecisionRow[] = await prisma.row.findMany({
    where: { tableId: prov.table.id },
    select: { id: true, data: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  // Per-decision VIEW authz (bulk): non-admins keep only decisions whose source
  // meeting they can access. Meeting-less / orphaned decisions → admin-only.
  if (!isAdmin) {
    const accessible = await prisma.meeting.findMany({
      where: { OR: [{ createdById: userId }, { participants: { some: { userId } } }] },
      select: { id: true },
    });
    const accessibleSet = new Set(accessible.map((m) => m.id));
    rows = rows.filter((r) => {
      const mid = str((r.data as Cells)[df.meetingId]);
      return mid != null && accessibleSet.has(mid);
    });
  }

  if (params.meetingId) rows = rows.filter((r) => str((r.data as Cells)[df.meetingId]) === params.meetingId);
  if (params.owner) rows = rows.filter((r) => ownerIdOf(r.data as Cells, df.owner) === params.owner);
  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter((r) => String((r.data as Cells)[df.text] ?? '').toLowerCase().includes(q));
  }

  const ownerIds = [...new Set(rows.map((r) => ownerIdOf(r.data as Cells, df.owner)).filter((x): x is string => !!x))];
  const meetingIds = [...new Set(rows.map((r) => str((r.data as Cells)[df.meetingId])).filter((x): x is string => !!x))];
  const owners = ownerIds.length
    ? new Map(
        (await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, image: true } })).map(
          (u) => [u.id, u as UserLite],
        ),
      )
    : new Map<string, UserLite>();
  const meetings = meetingIds.length
    ? new Map(
        (await prisma.meeting.findMany({ where: { id: { in: meetingIds } }, select: { id: true, title: true, scheduledAt: true, createdById: true } })).map(
          (m) => [m.id, m as MeetingLite],
        ),
      )
    : new Map<string, MeetingLite>();

  return rows.map((r) => assembleDecisionDTO(r, df, owners, meetings, viewer));
}

/** Count decision Rows in an org's system Decisions table (for usage stats). */
export async function countDecisions(orgId: string | null | undefined, since?: Date): Promise<number> {
  if (!orgId) return 0;
  const prov = await getSystemDecisionsTable(orgId);
  if (!prov) return 0;
  return prisma.row.count({ where: { tableId: prov.table.id, ...(since ? { createdAt: { gte: since } } : {}) } });
}

// ---- mutations -------------------------------------------------------------
export type DecisionCtx = {
  id: string;
  data: Cells;
  tableId: string;
  df: DecisionFieldIds;
  orgId: string;
  meetingId: string | null;
  fields: FieldLike[];
};

/**
 * Load a decision Row's mutation context, REFUSING anything that isn't a Row in
 * the (expected) org's system Decisions table. Returns null on not-found /
 * wrong-table / cross-org — the route maps that to 404.
 */
export async function loadDecisionCtx(id: string, expectedOrgId?: string | null): Promise<DecisionCtx | null> {
  if (!id) return null;
  const row = await prisma.row.findUnique({
    where: { id },
    select: { id: true, data: true, table: { select: { id: true, base: { select: { orgId: true } } } } },
  });
  if (!row) return null;
  const orgId = row.table.base.orgId;
  if (expectedOrgId && orgId !== expectedOrgId) return null;
  const prov = await getSystemDecisionsTable(orgId);
  if (!prov || prov.table.id !== row.table.id) return null; // must be THE Decisions table
  const fields = await prisma.field.findMany({ where: { tableId: prov.table.id }, select: { id: true, type: true, options: true } });
  const data = (row.data ?? {}) as Cells;
  return { id: row.id, data, tableId: prov.table.id, df: prov.fieldIds, orgId, meetingId: str(data[prov.fieldIds.meetingId]), fields };
}

/** EDIT/DELETE gate: admin OR the source meeting's creator. */
export async function decisionMutationAllowed(meetingId: string | null, userId: string, role: string | null | undefined): Promise<boolean> {
  if (role === 'admin') return true;
  if (!meetingId || !userId) return false;
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { createdById: true } });
  return !!m && m.createdById === userId;
}

/** Update a decision's text and/or owner (single person). Returns the new {id,text,ownerId}. */
export async function updateDecisionRow(ctx: DecisionCtx, patch: { text?: string; ownerId?: string | null }): Promise<{ id: string; text: string; ownerId: string | null }> {
  const p: Cells = {};
  if (patch.text !== undefined) p[ctx.df.text] = patch.text;
  if (patch.ownerId !== undefined) p[ctx.df.owner] = patch.ownerId ?? '';
  const merged = mergeRowData(ctx.fields, ctx.data, p);
  await prisma.row.update({ where: { id: ctx.id }, data: { data: merged as Prisma.InputJsonValue } });
  return { id: ctx.id, text: str(merged[ctx.df.text]) ?? '', ownerId: ownerIdOf(merged as Cells, ctx.df.owner) };
}

/** Delete a decision Row. */
export async function deleteDecisionRow(id: string): Promise<void> {
  await prisma.row.delete({ where: { id } });
}
