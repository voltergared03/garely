import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { captureException } from '../error-tracking';
import { publicBaseUrl } from '../config';
import { getCurrentOrgId } from '../org';
import { listTasks } from '../tasks';
import { listDecisions } from '../decisions';
import { sessionFor, type McpIdentity } from './auth';
import type { ToolDefinition } from './protocol';

/**
 * The tools an agent gets. Deliberately few and wide: one tool per REST endpoint
 * would put 150 descriptions into every connected client's context and leave the
 * model guessing which to call. These are shaped like the questions people actually
 * ask, and their descriptions steer the search → skim → read loop, because a model
 * cannot hold 29k transcript segments and must be told where to start.
 *
 * Every tool runs as the token's owner and reads through the same helpers the web
 * UI uses, so an agent can never surface a meeting its owner could not open.
 */

const MAX_EXCERPT_CHARS = 320;
const SEGMENT_SCAN_CAP = 500;

/* ── shared helpers ─────────────────────────────────────────── */

/**
 * Which meetings this identity may read — the same rule the web app applies in
 * GET /api/meetings: scoped to the org, and for anyone who is not an admin, narrowed
 * to meetings they created or took part in. Admins are not narrowed.
 *
 * Composed with AND rather than by spreading into one object. A spread lets a future
 * filter that happens to use `OR` silently overwrite the access clause and turn every
 * tool into a workspace-wide reader; an AND element cannot be clobbered by a caller's
 * filter, whatever shape it takes.
 */
async function meetingWhere(id: McpIdentity, extra: Prisma.MeetingWhereInput = {}): Promise<Prisma.MeetingWhereInput> {
  const and: Prisma.MeetingWhereInput[] = [extra];
  const orgId = await getCurrentOrgId(sessionFor(id));
  if (orgId) and.push({ orgId });
  if (id.role !== 'admin') {
    and.push({ OR: [{ createdById: id.userId }, { participants: { some: { userId: id.userId } } }] });
  }
  return { AND: and };
}

async function visibleMeetingIds(id: McpIdentity, extra: Prisma.MeetingWhereInput = {}): Promise<string[]> {
  const rows = await prisma.meeting.findMany({ where: await meetingWhere(id, extra), select: { id: true } });
  return rows.map((r) => r.id);
}

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const asInt = (v: unknown, fallback: number, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
};

function asDate(v: unknown): Date | undefined {
  const s = asString(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const fmtDate = (d: Date | null | undefined): string =>
  d ? d.toISOString().slice(0, 16).replace('T', ' ') : 'no date';

const clip = (s: string, n = MAX_EXCERPT_CHARS): string =>
  s.length <= n ? s : `${s.slice(0, n - 1)}…`;

/** mm:ss from seconds-into-the-meeting, so a quote can be found in the recording. */
function stamp(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Terms that must ALL appear. Short noise words are dropped, long queries trimmed. */
function searchTerms(query: string): string[] {
  const terms = query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  return terms.slice(0, 5);
}

const meetingLink = (base: string, id: string) => `${base}/meetings/${id}/report`;

/* ── tools ──────────────────────────────────────────────────── */

export const TOOLS: ToolDefinition[] = [
  {
    name: 'search_meetings',
    description:
      'Search everything that was SAID or WRITTEN across every meeting you can access: transcripts and AI reports. ' +
      'This is the tool to start with for questions like "what did we decide about X", "who raised Y", ' +
      '"when did we last discuss Z". Returns the meetings that matched, ranked, each with quoted excerpts, ' +
      'the speaker, a timestamp and a link. Then use get_meeting_report for depth on the ones that matter.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Words to look for. All of them must appear. Use the language spoken in the meetings.' },
        from: { type: 'string', description: 'ISO date — only meetings scheduled on or after this.' },
        to: { type: 'string', description: 'ISO date — only meetings scheduled on or before this.' },
        limit: { type: 'number', description: 'How many meetings to return (default 8, max 25).' },
      },
    },
  },
  {
    name: 'list_meetings',
    description:
      'List the meetings you can access, newest first — the index of what exists. Use it to survey a period ' +
      'before reading anything, or to find a meeting by title. Set include_summary to also get each meeting\'s ' +
      'AI summary, which is the cheapest way to review a whole month, but leave it off when titles and dates suffice.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring of the meeting title.' },
        from: { type: 'string', description: 'ISO date lower bound.' },
        to: { type: 'string', description: 'ISO date upper bound.' },
        participant: { type: 'string', description: 'Email of someone who took part.' },
        include_summary: { type: 'boolean', description: 'Include each meeting\'s AI summary (longer output).' },
        limit: { type: 'number', description: 'Default 25, max 100.' },
      },
    },
  },
  {
    name: 'get_meeting_report',
    description:
      'The full AI report of one meeting: summary, per-topic discussion, decisions, tasks and open questions. ' +
      'Use after search_meetings or list_meetings told you which meeting matters.',
    inputSchema: {
      type: 'object',
      required: ['meeting_id'],
      properties: { meeting_id: { type: 'string', description: 'Meeting id from another tool.' } },
    },
  },
  {
    name: 'get_transcript',
    description:
      'The raw transcript of one meeting, in order, paginated. A full transcript is long, so prefer ' +
      'search_meetings first; pass query here to jump straight to the part that mentions something.',
    inputSchema: {
      type: 'object',
      required: ['meeting_id'],
      properties: {
        meeting_id: { type: 'string' },
        query: { type: 'string', description: 'Only lines containing this.' },
        offset: { type: 'number', description: 'Skip this many lines (for paging).' },
        limit: { type: 'number', description: 'Default 150 lines, max 400.' },
      },
    },
  },
  {
    name: 'list_tasks',
    description:
      'Tasks produced from meetings: what is open, who owns it, when it is due. Use for "what do I still owe", ' +
      '"what came out of the meetings with the sales team", "what is overdue".',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['mine', 'all'], description: 'mine (default) or all you are allowed to see.' },
        status: { type: 'string', enum: ['open', 'in_progress', 'done'] },
        query: { type: 'string', description: 'Substring of the task title.' },
        meeting_id: { type: 'string', description: 'Only tasks from this meeting.' },
        limit: { type: 'number', description: 'Default 40, max 150.' },
      },
    },
  },
  {
    name: 'list_decisions',
    description:
      'The decisions registry: conclusions the AI extracted from meeting reports, with who owned them and ' +
      'which meeting settled them. Use for "what have we already decided about X".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring of the decision text.' },
        meeting_id: { type: 'string' },
        limit: { type: 'number', description: 'Default 40, max 150.' },
      },
    },
  },
];

/* ── handlers ───────────────────────────────────────────────── */

type Args = Record<string, unknown>;

async function searchMeetings(id: McpIdentity, args: Args): Promise<string> {
  const query = asString(args.query);
  if (!query) throw new ToolInputError('query is required');
  const limit = asInt(args.limit, 8, 25);
  const from = asDate(args.from);
  const to = asDate(args.to);

  const range: Prisma.MeetingWhereInput = {};
  if (from || to) range.scheduledAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const ids = await visibleMeetingIds(id, range);
  if (!ids.length) return 'No meetings you can access in that range.';

  const terms = searchTerms(query);
  const contains = (t: string) => ({ content: { contains: t, mode: 'insensitive' as const } });
  let segments = await prisma.transcriptSegment.findMany({
    where: { meetingId: { in: ids }, AND: terms.map(contains) },
    select: { meetingId: true, content: true, speakerName: true, startTime: true },
    orderBy: { startTime: 'asc' },
    take: SEGMENT_SCAN_CAP,
  });
  // Nothing matched every term — fall back to the longest one rather than nothing at all.
  if (!segments.length && terms.length > 1) {
    const longest = terms.slice().sort((a, b) => b.length - a.length)[0];
    segments = await prisma.transcriptSegment.findMany({
      where: { meetingId: { in: ids }, ...contains(longest) },
      select: { meetingId: true, content: true, speakerName: true, startTime: true },
      orderBy: { startTime: 'asc' },
      take: SEGMENT_SCAN_CAP,
    });
  }

  const reports = await prisma.meetingReport.findMany({
    where: { meetingId: { in: ids }, summary: { contains: terms[0] ?? query, mode: 'insensitive' } },
    select: { meetingId: true, summary: true },
    take: 50,
  });

  const hits = new Map<string, { count: number; quotes: string[] }>();
  for (const s of segments) {
    const e = hits.get(s.meetingId) ?? { count: 0, quotes: [] };
    e.count += 1;
    if (e.quotes.length < 3) {
      e.quotes.push(`  [${stamp(s.startTime)}] ${s.speakerName || 'unknown'}: ${clip(s.content)}`);
    }
    hits.set(s.meetingId, e);
  }
  for (const r of reports) {
    const e = hits.get(r.meetingId) ?? { count: 0, quotes: [] };
    e.count += 1;
    if (e.quotes.length < 3 && r.summary) e.quotes.push(`  [summary] ${clip(r.summary)}`);
    hits.set(r.meetingId, e);
  }
  if (!hits.size) return `Nothing found for "${query}" in ${ids.length} meetings you can access.`;

  const ranked = [...hits.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, limit);
  const meetings = await prisma.meeting.findMany({
    where: { id: { in: ranked.map(([mid]) => mid) } },
    select: { id: true, title: true, scheduledAt: true },
  });
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const base = await publicBaseUrl();

  const out = ranked.map(([mid, e], i) => {
    const m = byId.get(mid);
    return [
      `${i + 1}. ${m?.title ?? 'Meeting'} — ${fmtDate(m?.scheduledAt)} (${e.count} match${e.count === 1 ? '' : 'es'})`,
      `   id: ${mid} · ${meetingLink(base, mid)}`,
      ...e.quotes,
    ].join('\n');
  });
  return `Found "${query}" in ${hits.size} of ${ids.length} meetings.\n\n${out.join('\n\n')}`;
}

async function listMeetings(id: McpIdentity, args: Args): Promise<string> {
  const limit = asInt(args.limit, 25, 100);
  const from = asDate(args.from);
  const to = asDate(args.to);
  const query = asString(args.query);
  const participant = asString(args.participant);

  const extra: Prisma.MeetingWhereInput = {};
  if (from || to) extra.scheduledAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (query) extra.title = { contains: query, mode: 'insensitive' };
  if (participant) extra.participants = { some: { user: { email: { equals: participant, mode: 'insensitive' } } } };

  const meetings = await prisma.meeting.findMany({
    where: await meetingWhere(id, extra),
    select: {
      id: true, title: true, scheduledAt: true, durationMin: true, status: true,
      participants: { select: { id: true } },
      reports: { select: { summary: true }, take: 1, orderBy: { generatedAt: 'desc' } },
      _count: { select: { transcripts: true } },
    },
    orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  if (!meetings.length) return 'No meetings match.';

  const base = await publicBaseUrl();
  const withSummary = args.include_summary === true;
  const lines = meetings.map((m) => {
    const head = `• ${m.title} — ${fmtDate(m.scheduledAt)} · ${m.durationMin}min · ${m.status} · ` +
      `${m.participants.length} people · ${m._count.transcripts ? 'transcript' : 'no transcript'}` +
      `${m.reports.length ? ' · report' : ''}`;
    const meta = `  id: ${m.id} · ${meetingLink(base, m.id)}`;
    const sum = withSummary && m.reports[0]?.summary ? `\n  ${clip(m.reports[0].summary, 600)}` : '';
    return `${head}\n${meta}${sum}`;
  });
  return `${meetings.length} meeting(s):\n\n${lines.join('\n')}`;
}

async function getMeetingReport(id: McpIdentity, args: Args): Promise<string> {
  const meetingId = asString(args.meeting_id);
  if (!meetingId) throw new ToolInputError('meeting_id is required');
  const meeting = await prisma.meeting.findFirst({
    where: await meetingWhere(id, { id: meetingId }),
    select: {
      id: true, title: true, scheduledAt: true, durationMin: true, status: true,
      participants: { select: { user: { select: { name: true, email: true } }, guestName: true } },
      reports: { orderBy: { generatedAt: 'desc' }, take: 1 },
    },
  });
  // Same answer for "does not exist" and "not yours": never confirm a meeting you cannot read.
  if (!meeting) return 'No such meeting, or you do not have access to it.';

  const base = await publicBaseUrl();
  const people = meeting.participants
    .map((p) => p.user?.name || p.user?.email || p.guestName)
    .filter(Boolean)
    .join(', ');
  const header = [
    `# ${meeting.title}`,
    `${fmtDate(meeting.scheduledAt)} · ${meeting.durationMin} min · ${meeting.status}`,
    `Participants: ${people || 'none recorded'}`,
    meetingLink(base, meeting.id),
  ].join('\n');

  const report = meeting.reports[0];
  if (!report) return `${header}\n\nNo AI report for this meeting.`;

  const parts: string[] = [header];
  if (report.summary) parts.push(`## Summary\n${report.summary}`);

  const topics = Array.isArray(report.topics) ? (report.topics as Record<string, unknown>[]) : [];
  for (const t of topics) {
    const title = typeof t.title === 'string' ? t.title : 'Topic';
    const chunk: string[] = [`## ${title}`];
    if (typeof t.discussion === 'string' && t.discussion) chunk.push(t.discussion);
    const rows = (key: string, label: string, field: string) => {
      const arr = Array.isArray(t[key]) ? (t[key] as Record<string, unknown>[]) : [];
      if (!arr.length) return;
      chunk.push(`**${label}:**`);
      for (const item of arr) {
        const text = typeof item[field] === 'string' ? item[field] : JSON.stringify(item);
        const who = Array.isArray(item.assignees) ? ` — ${(item.assignees as string[]).join(', ')}`
          : typeof item.owner === 'string' && item.owner ? ` — ${item.owner}` : '';
        chunk.push(`- ${text}${who}`);
      }
    };
    rows('decisions', 'Decisions', 'text');
    rows('tasks', 'Tasks', 'title');
    rows('open_questions', 'Open questions', 'text');
    parts.push(chunk.join('\n'));
  }
  // Older reports predate topics and carry flat arrays instead.
  if (!topics.length) {
    const flat = (v: unknown, label: string) => {
      const arr = Array.isArray(v) ? v : [];
      if (arr.length) parts.push(`## ${label}\n${arr.map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n')}`);
    };
    flat(report.decisions, 'Decisions');
    flat(report.followUps, 'Open questions');
  }
  return parts.join('\n\n');
}

async function getTranscript(id: McpIdentity, args: Args): Promise<string> {
  const meetingId = asString(args.meeting_id);
  if (!meetingId) throw new ToolInputError('meeting_id is required');
  const meeting = await prisma.meeting.findFirst({
    where: await meetingWhere(id, { id: meetingId }),
    select: { id: true, title: true, scheduledAt: true },
  });
  if (!meeting) return 'No such meeting, or you do not have access to it.';

  const limit = asInt(args.limit, 150, 400);
  const offset = asInt(args.offset, 1, 100_000) - 1;
  const query = asString(args.query);
  const where = {
    meetingId,
    ...(query ? { content: { contains: query, mode: 'insensitive' as const } } : {}),
  };
  const [total, segments] = await Promise.all([
    prisma.transcriptSegment.count({ where }),
    prisma.transcriptSegment.findMany({
      where,
      select: { content: true, speakerName: true, startTime: true },
      orderBy: { startTime: 'asc' },
      skip: args.offset === undefined ? 0 : offset,
      take: limit,
    }),
  ]);
  if (!total) return `${meeting.title}: no transcript${query ? ` matching "${query}"` : ''}.`;

  const shown = segments.map((s) => `[${stamp(s.startTime)}] ${s.speakerName || 'unknown'}: ${s.content}`);
  const skipped = args.offset === undefined ? 0 : offset;
  const more = total - skipped - segments.length;
  const foot = more > 0 ? `\n\n…${more} more line(s). Call again with offset ${skipped + segments.length + 1}.` : '';
  return `${meeting.title} — ${fmtDate(meeting.scheduledAt)} (${total} line(s)${query ? ` matching "${query}"` : ''})\n\n${shown.join('\n')}${foot}`;
}

async function tasks(id: McpIdentity, args: Args): Promise<string> {
  const limit = asInt(args.limit, 40, 150);
  const rows = await listTasks(sessionFor(id), {
    scope: args.scope === 'all' ? 'all' : 'mine',
    status: asString(args.status) ?? null,
    q: asString(args.query) ?? null,
    meetingId: asString(args.meeting_id) ?? null,
  });
  if (!rows.length) return 'No tasks match.';
  const base = await publicBaseUrl();
  const lines = rows.slice(0, limit).map((t) => {
    const due = t.dueDate ? ` · due ${t.dueDate.slice(0, 10)}` : '';
    const who = t.assigneeName ? ` · ${t.assigneeName}` : '';
    const src = t.meetingId ? ` · from ${meetingLink(base, t.meetingId)}` : '';
    return `• [${t.status}] ${t.title}${who}${due}${src}`;
  });
  const more = rows.length > limit ? `\n\n…and ${rows.length - limit} more.` : '';
  return `${rows.length} task(s):\n\n${lines.join('\n')}${more}`;
}

async function decisions(id: McpIdentity, args: Args): Promise<string> {
  const limit = asInt(args.limit, 40, 150);
  const rows = await listDecisions(sessionFor(id), {
    q: asString(args.query) ?? null,
    meetingId: asString(args.meeting_id) ?? null,
  });
  if (!rows.length) return 'No decisions match.';
  const base = await publicBaseUrl();
  const lines = rows.slice(0, limit).map((d) => {
    const when = d.date || d.meeting?.scheduledAt?.slice(0, 10) || '';
    const who = d.owner?.name ? ` · ${d.owner.name}` : '';
    const src = d.meetingId ? ` · ${meetingLink(base, d.meetingId)}` : '';
    return `• ${d.text}${who}${when ? ` · ${when.slice(0, 10)}` : ''}${src}`;
  });
  const more = rows.length > limit ? `\n\n…and ${rows.length - limit} more.` : '';
  return `${rows.length} decision(s):\n\n${lines.join('\n')}${more}`;
}

const HANDLERS: Record<string, (id: McpIdentity, args: Args) => Promise<string>> = {
  search_meetings: searchMeetings,
  list_meetings: listMeetings,
  get_meeting_report: getMeetingReport,
  get_transcript: getTranscript,
  list_tasks: tasks,
  list_decisions: decisions,
};

/**
 * A message written here, and therefore safe to hand to the model. Anything else that
 * escapes a handler is a dependency's error: Prisma's carry the deployed file path, the
 * database host and the pool settings, and the tool result goes straight to whoever
 * holds the token. Those are logged with a reference and replaced.
 */
export class ToolInputError extends Error {}

export async function callTool(id: McpIdentity, name: string, args: Args): Promise<string> {
  const handler = HANDLERS[name];
  if (!handler) throw new ToolInputError(`unknown tool: ${name}`);
  try {
    return await handler(id, args);
  } catch (e) {
    if (e instanceof ToolInputError) throw e;
    const ref = randomUUID();
    logger.error('mcp_tool_error', {
      tool: name,
      ref,
      userId: id.userId,
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    captureException(e, { tool: name, ref, userId: id.userId });
    throw new ToolInputError(`internal error (ref: ${ref})`);
  }
}
