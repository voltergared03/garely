import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
import { readConfig, CONFIG_DEFAULTS, getGoogleConfig } from './config';

// Lazy / per-request config so the Google OAuth credentials can be read from
// the database (set during the first-run /setup flow) instead of being baked
// into env at boot. Falls back to env vars when DB values are absent.
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const google = await getGoogleConfig();

  return {
    trustHost: true,
    adapter: PrismaAdapter(prisma),
    providers: [
      Google({
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        // Link Google login to a pre-created (invited) user with the same email
        allowDangerousEmailAccountLinking: true,
      }),
    ],
    session: {
      strategy: 'jwt',
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
        }
        // Always fetch the latest role + 2FA status from DB (read by middleware via getToken)
        if (token.id) {
          const dbUser = (await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, totpEnabled: true } as any,
          })) as any;
          token.role = dbUser?.role || 'member';
          token.totpEnabled = !!dbUser?.totpEnabled;

          // Presence / "last seen": refresh lastLogin on sign-in and at most once
          // every 2 minutes of activity, so the admin status reflects real recent
          // activity (Online for active users) instead of only the last sign-in.
          const now = Date.now();
          const seenAt = (token as any).seenAt as number | undefined;
          if (user || !seenAt || now - seenAt > 120_000) {
            (token as any).seenAt = now;
            await prisma.user
              .update({
                where: { id: token.id as string },
                data: { lastLogin: new Date() },
              })
              .catch(() => {});
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).id = token.id;
          (session.user as any).role = token.role;
        }
        return session;
      },
    },
    events: {
      // Apply workspace defaults (timezone / language) to brand-new users.
      async createUser({ user }) {
        try {
          const cfg = await readConfig(['WS_TIMEZONE', 'WS_LANGUAGE']);
          const tz = cfg.WS_TIMEZONE || CONFIG_DEFAULTS.WS_TIMEZONE;
          const lang = cfg.WS_LANGUAGE || CONFIG_DEFAULTS.WS_LANGUAGE;
          await prisma.user.update({
            where: { id: user.id as string },
            data: { timezone: tz, preferences: { language: lang } },
          });
        } catch {
          /* non-fatal: keep schema defaults */
        }
      },
    },
    pages: {
      signIn: '/login',
    },
  };
});
