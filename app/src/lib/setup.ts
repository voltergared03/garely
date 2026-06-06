import crypto from 'node:crypto';
import { readConfig, writeConfig, getGoogleConfig, CONFIG_DEFAULTS } from './config';
import { prisma } from './prisma';

/**
 * First-run setup state.
 *
 * The whole app is gated behind a one-time setup flow until SETUP_COMPLETE is
 * set. Access to /setup is protected by SETUP_TOKEN, which is auto-generated on
 * first boot and printed to the container logs (see instrumentation.ts). The
 * token is stored in plaintext in SystemConfig (root-only DB) and is *deleted*
 * the moment setup completes, so it can never be reused afterwards.
 */

const K_DONE = 'SETUP_COMPLETE';
const K_TOKEN = 'SETUP_TOKEN';

/** True once the workspace has been configured via /setup. Fail-safe: on any
 *  DB error we report "not complete" (the /setup route is itself token-gated). */
export async function isSetupComplete(): Promise<boolean> {
  try {
    const m = await readConfig([K_DONE]);
    if (m[K_DONE] === 'true') return true;

    // Self-migration for instances created before the /setup wizard existed:
    // if the workspace is already usable (an admin exists AND Google OAuth
    // credentials are present in the DB or env), treat setup as complete and
    // persist the flag so this check only runs once. This prevents an upgrade
    // from locking a working deployment behind the wizard.
    const [adminCount, google] = await Promise.all([
      prisma.user.count({ where: { role: 'admin' } }),
      getGoogleConfig(),
    ]);
    if (adminCount > 0 && google.clientId && google.clientSecret) {
      await writeConfig({ [K_DONE]: 'true' }).catch(() => {});
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Read the current setup token, or null if none exists / already consumed. */
export async function getSetupToken(): Promise<string | null> {
  const m = await readConfig([K_TOKEN]);
  return m[K_TOKEN] || null;
}

/** Return the existing setup token or create+persist a fresh one. */
export async function getOrCreateSetupToken(): Promise<string> {
  const existing = await getSetupToken();
  if (existing) return existing;
  const token = crypto.randomBytes(24).toString('base64url');
  await writeConfig({ [K_TOKEN]: token });
  return token;
}

/** Constant-time string comparison (avoids leaking token via timing). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Validate a setup token. Always false once setup is complete. */
export async function verifySetupToken(input: string | null | undefined): Promise<boolean> {
  if (!input) return false;
  if (await isSetupComplete()) return false;
  const token = await getSetupToken();
  if (!token) return false;
  return safeEqual(input, token);
}

/**
 * Provision the workspace's FIRST organization (Phase-1 multi-tenancy) and make
 * `adminUserId` its OWNER. Called by BOTH setup paths (password + Google) so a
 * fresh install always lands with org #1 — `orgId` is NOT NULL everywhere, so an
 * install with no org breaks every scoped query. Idempotent: reuses the existing
 * org if one is already present (e.g. an upgraded instance) and only ensures the
 * OWNER membership, so it's safe to call from either path / on a re-run.
 */
export async function provisionFirstOrg(adminUserId: string): Promise<{ id: string }> {
  const existing = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  let orgId = existing?.id;
  if (!orgId) {
    const wsName = ((await readConfig(['WS_NAME'])).WS_NAME || CONFIG_DEFAULTS.WS_NAME || 'Workspace').trim();
    const slug = wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'org';
    const org = await prisma.organization.create({ data: { name: wsName, slug } });
    orgId = org.id;
  }
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId, userId: adminUserId } },
    update: { role: 'OWNER' },
    create: { orgId, userId: adminUserId, role: 'OWNER' },
  });
  return { id: orgId };
}

/** Finalize setup: mark complete and burn the one-time token. */
export async function markSetupComplete(): Promise<void> {
  await writeConfig({ [K_DONE]: 'true' });
  try {
    await prisma.systemConfig.delete({ where: { key: K_TOKEN } });
  } catch {
    /* token already gone — fine */
  }
}
