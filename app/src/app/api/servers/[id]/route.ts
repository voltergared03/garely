import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import {
  serverConnectionView,
  encryptServerSecret,
  normalizeServerPassword,
} from '@/lib/server-credentials';
import { userCanAccessServer } from '@/lib/server-access';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/servers/[id] — one connection (credentials stripped). Any user who can
// access it (admin / explicit grant / granted department).
export const GET = withRoute('servers.get', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const c = await prisma.serverConnection.findFirst({ where: { id, orgId: r.orgId } });
  if (!c) return jsonError('not_found', 404);
  if (!(await userCanAccessServer(id, r.session.user.id, r.session.user.role))) {
    return jsonError('forbidden', 403);
  }
  return NextResponse.json(serverConnectionView(c));
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    host: z.string().trim().min(1).max(255).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().trim().min(1).max(255).optional(),
    // non-empty → set new password; omit / empty → leave the stored cipher unchanged
    password: z.string().max(1000).optional(),
    domain: z.string().trim().max(255).nullish(),
    departmentId: z.string().trim().min(1).nullish(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// PATCH /api/servers/[id] — admin-only edit. Setting a non-empty password re-encrypts.
export const PATCH = withRoute('servers.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const { id } = await ctx.params;
  const c = await prisma.serverConnection.findFirst({ where: { id, orgId: r.orgId } });
  if (!c) return jsonError('not_found', 404);
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const d = parsed.data;
  if (d.departmentId && !(await prisma.department.count({ where: { id: d.departmentId, orgId: r.orgId } }))) {
    return jsonError('invalid_department', 400);
  }
  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.host !== undefined) data.host = d.host;
  if (d.port !== undefined) data.port = d.port;
  if (d.username !== undefined) data.username = d.username;
  if (d.domain !== undefined) data.domain = d.domain ?? null;
  if (d.departmentId !== undefined) data.departmentId = d.departmentId ?? null;
  if (d.settings !== undefined) data.settings = d.settings as object;
  const pw = normalizeServerPassword(d.password);
  if (pw) data.secretCipher = encryptServerSecret(pw);
  const updated = await prisma.serverConnection.update({ where: { id }, data });
  return NextResponse.json(serverConnectionView(updated));
});

// DELETE /api/servers/[id] — admin-only. Cascades accesses / sessions / transfers.
export const DELETE = withRoute('servers.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const { id } = await ctx.params;
  const c = await prisma.serverConnection.findFirst({ where: { id, orgId: r.orgId }, select: { id: true } });
  if (!c) return jsonError('not_found', 404);
  await prisma.serverConnection.delete({ where: { id } });
  return jsonOk();
});
