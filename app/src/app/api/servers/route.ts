import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import {
  serverConnectionView,
  encryptServerSecret,
  normalizeServerPassword,
} from '@/lib/server-credentials';
import { visibleServerConnections } from '@/lib/server-access';
import { activeSessionsByConnection } from '@/lib/server-presence';

// GET /api/servers — admins get every connection in the org (+ accessCount for the
// management UI); members get only the connections they may reach. Credentials are
// never included (serverConnectionView strips secretCipher → only `hasSecret`).
// Each server also carries `activeSessions` (who is currently connected) so users can
// see a server is in use — and by whom — before connecting and bumping each other.
export const GET = withRoute('servers.list', async () => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const isAdmin = r.session.user.role === 'admin';

  let servers: Array<ReturnType<typeof serverConnectionView> & { accessCount?: number }>;
  if (isAdmin) {
    const rows = await prisma.serverConnection.findMany({
      where: { orgId: r.orgId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { accesses: true } } },
    });
    servers = rows.map((c) => ({ ...serverConnectionView(c), accessCount: c._count.accesses }));
  } else {
    const rows = await visibleServerConnections(r.session.user.id, r.session.user.role, r.orgId);
    servers = rows.map(serverConnectionView);
  }

  const presence = await activeSessionsByConnection(servers.map((s) => s.id), r.session.user.id);
  return NextResponse.json({
    canManage: isAdmin,
    servers: servers.map((s) => ({ ...s, activeSessions: presence[s.id] ?? [] })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().trim().min(1).max(255),
  password: z.string().max(1000).optional(),
  domain: z.string().trim().max(255).nullish(),
  departmentId: z.string().trim().min(1).nullish(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

// POST /api/servers — admin-only: register a connection. The password is encrypted
// at rest (secretCipher) and never echoed back.
export const POST = withRoute('servers.create', async (req: NextRequest) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const d = parsed.data;
  // Validate the optional owning-department belongs to this org.
  if (d.departmentId && !(await prisma.department.count({ where: { id: d.departmentId, orgId: r.orgId } }))) {
    return jsonError('invalid_department', 400);
  }
  const pw = normalizeServerPassword(d.password);
  const c = await prisma.serverConnection.create({
    data: {
      orgId: r.orgId,
      name: d.name,
      host: d.host,
      port: d.port ?? 3389,
      username: d.username,
      secretCipher: pw ? encryptServerSecret(pw) : null,
      domain: d.domain ?? null,
      departmentId: d.departmentId ?? null,
      settings: (d.settings ?? {}) as object,
      createdById: r.session.user.id,
    },
  });
  return NextResponse.json(serverConnectionView(c), { status: 201 });
});
