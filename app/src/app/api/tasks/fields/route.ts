import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { fieldTypeSchema } from '@/lib/base-engine';
import { createTaskField, listTaskFields } from '@/lib/tasks';

/**
 * Field-schema for the per-org system "Tasks" table (P3.3, roadmap §15).
 *
 * The generic /api/tables/[id]/fields + /api/fields routes refuse system tables
 * (the 3.2 guard), so this is the ONLY in-app way to add custom columns to
 * tasks. The table id is resolved from the caller's org — never accepted from
 * the client — and mutations are admin-gated (the schema is org-wide). This
 * handles FIELD SCHEMA ONLY; task ROWS keep flowing through /api/tasks where
 * userCanViewTask stays the sole row-level gate.
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: fieldTypeSchema,
  options: z.unknown().optional(),
});

// GET /api/tasks/fields — the system Tasks table's Field schema (any member).
export const GET = withRoute('tasks.fields.list', async (_req: NextRequest) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  return NextResponse.json(await listTaskFields(r.session));
});

// POST /api/tasks/fields — add a CUSTOM field to the org's Tasks table (admin).
export const POST = withRoute('tasks.fields.create', async (req: NextRequest) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const result = await createTaskField(r.orgId, parsed.data);
  if ('error' in result) return jsonError(result.error, result.status);
  return NextResponse.json(result.field, { status: 201 });
});
