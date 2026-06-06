import { Prisma } from '@prisma/client';
import type { Session } from 'next-auth';
import { prisma } from './prisma';
import { getSystemDecisionsTable, type DecisionFieldIds } from './system-decisions-table';
import { getCurrentOrgId } from './org';

/**
 * Decisions registry adapter (Phase 4.2, roadmap §16) — the single read layer
 * for the meeting-decisions registry. Decisions are base-engine Rows in the
 * per-org system "Decisions" table; their structural Meeting/Report/Source
 * fields live in `Row.data` (no sidecar — no prod DDL). The generic base/row
 * APIs refuse system tables (the 3.2 guard), so this bespoke adapter + the
 * `/api/decisions` route are the ONLY way to read them — exactly mirroring how
 * `lib/tasks.ts` + `/api/tasks` shield the system Tasks table.
 *
 * Per-decision authz (the chosen model): a user sees a decision ONLY if they
 * can access its source meeting (creator or participant). Admins see all. This
 * gate is the source-meeting-access rule applied in BULK inside `listDecisions`
 * — the set of accessible meeting ids is computed once, then rows are kept iff
 * their `Meeting` cell is in that set. A decision with no meeting is admin-only
 * (there is no manual-decision path yet). Tenant isolation comes entirely from
 * scoping every query to the org's single system Decisions `tableId`.
 */

type UserLite = { id: string; name: string | null; image: string | null };
type Cells = Record<string, unknown>;

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
  createdAt: string;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);

/**
 * The Owner field is `person` with `multiple:false`, so `coerceCell` stores a
 * single string id — but read defensively (an array could appear if the field
 * is ever switched to multiple).
 */
function ownerIdOf(data: Cells, ownerFieldId: string): string | null {
  const v = data[ownerFieldId];
  if (typeof v === 'string' && v) return v;
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0]) return v[0];
  return null;
}

type DecisionRow = { id: string; data: Prisma.JsonValue; createdAt: Date };

/** Pure projector: Row + batched owner/meeting maps → DecisionDTO. */
export function assembleDecisionDTO(
  row: DecisionRow,
  df: DecisionFieldIds,
  owners: Map<string, UserLite>,
  meetings: Map<string, { id: string; title: string; scheduledAt: Date | null }>,
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
    createdAt: row.createdAt.toISOString(),
  };
}

export type ListDecisionParams = {
  meetingId?: string | null;
  owner?: string | null; // a userId
  q?: string | null;
};

/**
 * List the decisions the session user may see, newest first. Filters
 * (meeting/owner/text search) are applied app-side over the small per-org set
 * — consistent with the base-rows v1 philosophy. The access gate runs BEFORE
 * the filters, so passing a `meetingId` can only narrow within already-visible
 * decisions (never widen).
 */
export async function listDecisions(session: Session, params: ListDecisionParams = {}): Promise<DecisionDTO[]> {
  const orgId = await getCurrentOrgId(session);
  if (!orgId) return [];
  const prov = await getSystemDecisionsTable(orgId);
  if (!prov) return [];
  const df = prov.fieldIds;
  const userId = session.user.id;
  const isAdmin = session.user.role === 'admin';

  let rows: DecisionRow[] = await prisma.row.findMany({
    where: { tableId: prov.table.id },
    select: { id: true, data: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  // Per-decision authz (bulk): non-admins keep only decisions whose source
  // meeting they can access. Decisions whose meeting is missing/deleted fall
  // out of the accessible set → admin-only.
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
        (await prisma.meeting.findMany({ where: { id: { in: meetingIds } }, select: { id: true, title: true, scheduledAt: true } })).map(
          (m) => [m.id, m],
        ),
      )
    : new Map<string, { id: string; title: string; scheduledAt: Date | null }>();

  return rows.map((r) => assembleDecisionDTO(r, df, owners, meetings));
}

/** Count decision Rows in an org's system Decisions table (for usage stats). */
export async function countDecisions(orgId: string | null | undefined, since?: Date): Promise<number> {
  if (!orgId) return 0;
  const prov = await getSystemDecisionsTable(orgId);
  if (!prov) return 0;
  return prisma.row.count({ where: { tableId: prov.table.id, ...(since ? { createdAt: { gte: since } } : {}) } });
}
