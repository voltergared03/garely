/**
 * One-time multi-tenancy backfill (Phase 1).
 *
 * Installs created BEFORE multi-tenancy have rows with a NULL `orgId` and no
 * Organization/Membership. This script brings them up to the multi-tenant model.
 * New installs do NOT need it — /setup creates org #1 directly.
 *
 * Idempotent: safe to run repeatedly (find-or-create org, only enrolls users
 * who lack a membership, only stamps rows whose orgId is still null).
 *
 * UPGRADE ORDER (existing single-tenant install → multi-tenant build):
 *   1) prisma db push          # additive: Organization/Membership + NULLABLE orgId
 *   2) node scripts/seed-org.mjs   # THIS — org #1, memberships, stamp orgId everywhere
 *   3) deploy the app code that resolves/filters by orgId
 *   4) prisma db push          # the non-null tighten + composite indexes
 *
 * Run it where @prisma/client + DATABASE_URL are available (the build/app context):
 *   DATABASE_URL=... npm run db:backfill-org
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';

// Tenant-owned aggregate roots that carry their own orgId (children inherit via
// their parent — see the garely-architecture memory). Keep in sync with schema.
const ROOT_MODELS = [
  'meeting',
  'meetingTask',
  'department',
  'quiz',
  'notification',
  'registrationRequest',
  'emailLog',
];

async function main() {
  // 1) Find-or-create the singleton organization.
  let org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) {
    const wsName =
      (await prisma.systemConfig.findUnique({ where: { key: 'WS_NAME' } }))?.value?.trim() ||
      'Workspace';
    let slug = slugify(wsName);
    if (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    org = await prisma.organization.create({ data: { name: wsName, slug } });
    console.log(`Created organization "${org.name}" (${org.id}, slug=${org.slug}).`);
  } else {
    console.log(`Using existing organization "${org.name}" (${org.id}).`);
  }

  // 2) Ensure every user has a membership in this org.
  //    Role map: oldest admin → OWNER (unless one already exists),
  //    other admins → ADMIN, everyone else → MEMBER.
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true },
  });
  const existing = await prisma.membership.findMany({
    where: { orgId: org.id },
    select: { userId: true, role: true },
  });
  const enrolled = new Set(existing.map((m) => m.userId));
  let ownerTaken = existing.some((m) => m.role === 'OWNER');

  let created = 0;
  for (const u of users) {
    if (enrolled.has(u.id)) continue;
    let role = 'MEMBER';
    if (u.role === 'admin') {
      if (!ownerTaken) {
        role = 'OWNER';
        ownerTaken = true;
      } else {
        role = 'ADMIN';
      }
    }
    await prisma.membership.create({ data: { orgId: org.id, userId: u.id, role } });
    created++;
  }
  console.log(
    `Memberships: ${created} created, ${enrolled.size} already present (${users.length} users total).`,
  );

  // 3) Stamp orgId on every aggregate-root row that still lacks one.
  let stampedTotal = 0;
  for (const model of ROOT_MODELS) {
    const res = await prisma[model].updateMany({
      where: { orgId: null },
      data: { orgId: org.id },
    });
    if (res.count) {
      console.log(`  ${model}: stamped ${res.count} row(s).`);
      stampedTotal += res.count;
    }
  }
  console.log(`Backfill complete — ${stampedTotal} row(s) stamped.`);
}

main()
  .catch((e) => {
    console.error('seed-org failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
