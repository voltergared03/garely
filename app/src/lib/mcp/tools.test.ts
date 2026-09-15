import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { TOOLS, callTool } from './tools';
import type { McpIdentity } from './auth';

vi.mock('@/lib/prisma');
vi.mock('@/lib/config', () => ({ publicBaseUrl: vi.fn(async () => 'https://meet.example.com') }));
vi.mock('@/lib/tasks', () => ({ listTasks: vi.fn(async () => []) }));
vi.mock('@/lib/decisions', () => ({ listDecisions: vi.fn(async () => []) }));
vi.mock('@/lib/org', () => ({ getCurrentOrgId: vi.fn(async () => 'org1') }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/error-tracking', () => ({ captureException: vi.fn() }));

/** The access filter is an AND element, so a caller's own filters can never clobber it. */
const accessClause = (where: any) => (where?.AND || []).find((c: any) => c?.OR);
const orgClause = (where: any) => (where?.AND || []).find((c: any) => c?.orgId);

beforeEach(() => { mockReset(prismaMock); });

const member: McpIdentity = { tokenId: 't', userId: 'u1', role: 'member', orgId: null, scopes: ['read'] };
const admin: McpIdentity = { ...member, userId: 'admin1', role: 'admin' };

describe('MCP tools', () => {
  it('offers a small, described toolset — one tool per endpoint would drown the model', () => {
    expect(TOOLS.length).toBeLessThanOrEqual(8);
    expect(TOOLS.map((t) => t.name)).toContain('search_meetings');
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(80);
      expect(t.inputSchema).toHaveProperty('type', 'object');
    }
  });

  it('a member only ever queries meetings they created or attended', async () => {
    prismaMock.meeting.findMany.mockResolvedValue([] as any);
    await callTool(member, 'list_meetings', {});
    const where = (prismaMock.meeting.findMany.mock.calls[0][0] as any).where;
    expect(accessClause(where).OR).toEqual([
      { createdById: 'u1' },
      { participants: { some: { userId: 'u1' } } },
    ]);
    expect(orgClause(where)).toEqual({ orgId: 'org1' });
  });

  it('an admin is not narrowed to their own meetings, but is still held to the org', async () => {
    prismaMock.meeting.findMany.mockResolvedValue([] as any);
    await callTool(admin, 'list_meetings', {});
    const where = (prismaMock.meeting.findMany.mock.calls[0][0] as any).where;
    expect(accessClause(where)).toBeUndefined();
    expect(orgClause(where)).toEqual({ orgId: 'org1' });
  });

  it('EVERY tool that touches meetings carries the access filter — including through search', async () => {
    // The guard that matters: add a seventh meeting-reading tool without scoping it and
    // this fails. A member must never issue an unscoped meeting query, whatever the path.
    prismaMock.meeting.findMany.mockResolvedValue([] as any);
    prismaMock.meeting.findFirst.mockResolvedValue(null as any);
    prismaMock.transcriptSegment.findMany.mockResolvedValue([] as any);
    prismaMock.meetingReport.findMany.mockResolvedValue([] as any);

    await callTool(member, 'list_meetings', {});
    await callTool(member, 'search_meetings', { query: 'anything' });
    await callTool(member, 'get_meeting_report', { meeting_id: 'm-someone-elses' });
    await callTool(member, 'get_transcript', { meeting_id: 'm-someone-elses' });

    const wheres = [
      ...prismaMock.meeting.findMany.mock.calls.map((c) => (c[0] as any).where),
      ...prismaMock.meeting.findFirst.mock.calls.map((c) => (c[0] as any).where),
    ];
    expect(wheres.length).toBeGreaterThanOrEqual(4);
    for (const where of wheres) {
      expect(accessClause(where), JSON.stringify(where)).toBeDefined();
      expect(orgClause(where), JSON.stringify(where)).toBeDefined();
    }
  });

  it('a filter that uses OR cannot displace the access clause — they are separate AND elements', async () => {
    prismaMock.meeting.findMany.mockResolvedValue([] as any);
    await callTool(member, 'list_meetings', { query: 'sync', participant: 'someone@else.com' });
    const where = (prismaMock.meeting.findMany.mock.calls[0][0] as any).where;
    expect(accessClause(where).OR[0]).toEqual({ createdById: 'u1' });
    // The caller's own filters live in their own element, next to the guard, never on top of it.
    const own = where.AND[0];
    expect(own.title).toEqual({ contains: 'sync', mode: 'insensitive' });
    expect(own.participants).toBeDefined();
  });

  it('a meeting you cannot read answers the same as one that does not exist', async () => {
    prismaMock.meeting.findFirst.mockResolvedValue(null as any);
    const report = await callTool(member, 'get_meeting_report', { meeting_id: 'someone-elses' });
    const transcript = await callTool(member, 'get_transcript', { meeting_id: 'someone-elses' });
    expect(report).toBe('No such meeting, or you do not have access to it.');
    expect(transcript).toBe(report);
  });

  it('search requires every term, and falls back to the longest one rather than nothing', async () => {
    prismaMock.meeting.findMany.mockResolvedValue([{ id: 'm1' }] as any);
    prismaMock.transcriptSegment.findMany.mockResolvedValueOnce([] as any).mockResolvedValueOnce([] as any);
    prismaMock.meetingReport.findMany.mockResolvedValue([] as any);

    await callTool(member, 'search_meetings', { query: 'allegro польща' });

    const first = (prismaMock.transcriptSegment.findMany.mock.calls[0][0] as any).where;
    expect(first.AND).toHaveLength(2);
    const retry = (prismaMock.transcriptSegment.findMany.mock.calls[1][0] as any).where;
    expect(retry.content.contains).toBe('allegro'); // the longest term
  });

  it('search returns quotes with speaker, timestamp and a link back into Garely', async () => {
    prismaMock.meeting.findMany
      .mockResolvedValueOnce([{ id: 'm1' }] as any)
      .mockResolvedValueOnce([{ id: 'm1', title: 'Sync w Sales', scheduledAt: new Date('2026-09-07T10:00:00Z') }] as any);
    prismaMock.transcriptSegment.findMany.mockResolvedValue([
      { meetingId: 'm1', content: 'ми виходимо на Allegro у жовтні', speakerName: 'Денис', startTime: 754 },
    ] as any);
    prismaMock.meetingReport.findMany.mockResolvedValue([] as any);

    const out = await callTool(member, 'search_meetings', { query: 'allegro' });

    expect(out).toMatch(/Sync w Sales/);
    expect(out).toMatch(/\[12:34\] Денис: ми виходимо на Allegro/);
    expect(out).toMatch(/https:\/\/meet\.example\.com\/meetings\/m1\/report/);
  });

  it('says so plainly when nothing matched, instead of returning an empty blob', async () => {
    prismaMock.meeting.findMany.mockResolvedValue([{ id: 'm1' }] as any);
    prismaMock.transcriptSegment.findMany.mockResolvedValue([] as any);
    prismaMock.meetingReport.findMany.mockResolvedValue([] as any);
    const out = await callTool(member, 'search_meetings', { query: 'unicorn' });
    expect(out).toMatch(/Nothing found for "unicorn"/);
  });

  it('refuses an unknown tool', async () => {
    await expect(callTool(member, 'drop_database', {})).rejects.toThrow(/unknown tool/);
  });

  it('never hands an internal error to the caller — it logs it and returns a reference', async () => {
    // A Prisma error carries the deployed file path, the database host and the pool
    // settings, and a tool result goes straight to whoever holds the token.
    const { logger } = await import('@/lib/logger');
    prismaMock.meeting.findMany.mockRejectedValue(
      new Error('Invalid `prisma.meeting.findMany()` invocation in /app/src/lib/mcp/tools.ts:206 — can\'t reach database server at `eam-meet-db`:5432'),
    );
    await expect(callTool(member, 'list_meetings', {})).rejects.toThrow(/^internal error \(ref: [0-9a-f-]{36}\)$/);
    expect(logger.error).toHaveBeenCalledWith('mcp_tool_error', expect.objectContaining({ tool: 'list_meetings', userId: 'u1' }));
  });

  it('still passes its OWN messages through, so the model can fix its call', async () => {
    await expect(callTool(member, 'search_meetings', {})).rejects.toThrow('query is required');
    await expect(callTool(member, 'get_meeting_report', {})).rejects.toThrow('meeting_id is required');
  });
});
