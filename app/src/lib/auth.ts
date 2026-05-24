import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
import { readConfig, CONFIG_DEFAULTS, getGoogleConfig, getAuthConfig } from './config';
import { verifyPassword } from './password';
import { rateLimit, rateLimitReset } from './rate-limit';

// Lazy / per-request config so the enabled sign-in methods + Google OAuth
// credentials can be read from the database (set during /setup) instead of
// baked into env. Providers are added conditionally per getAuthConfig(), so an
// existing Google-only deployment is unaffected until password auth is enabled.
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const [google, authCfg] = await Promise.all([getGoogleConfig(), getAuthConfig()]);

  const providers: any[] = [];

  if (authCfg.googleEnabled && google.clientId && google.clientSecret) {
    providers.push(
      Google({
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        // Link Google login to a pre-created (invited) user with the same email
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (authCfg.passwordEnabled) {
    providers.push(
      Credentials({
        name: 'credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(creds) {
          const email = String(creds?.email || '').trim().toLowerCase();
          const password = String(creds?.password || '');
          if (!email || !password) return null;

          // Brute-force throttle (in-process; single-container deployment).
          const key = `login:${email}`;
          if (!rateLimit(key, 10, 5 * 60_000).ok) return null;

          const user = (await prisma.user.findUnique({
            where: { email },
            select: {
              id: true, email: true, name: true, image: true,
              passwordHash: true, status: true,
            } as any,
          })) as any;

          // Must be an active account that actually has a password set.
          if (!user || !user.passwordHash || user.status !== 'active') return null;
          if (!(await verifyPassword(password, user.passwordHash))) return null;

          rateLimitReset(key);
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        },
      }),
    );
  }

  return {
    trustHost: true,
    adapter: PrismaAdapter(prisma),
    providers,
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
            select: { role: true, totpEnabled: true, status: true, mustChangePassword: true, preferences: true } as any,
          })) as any;
          token.role = dbUser?.role || 'member';
          token.totpEnabled = !!dbUser?.totpEnabled;
          token.status = dbUser?.status || 'active';
          token.mustChangePassword = !!dbUser?.mustChangePassword;
          // The user's saved UI language (if any). Read client-side by <LocaleSync>
          // to keep the `locale` cookie in step with their preference.
          const prefLang = (dbUser?.preferences as any)?.language;
          token.locale = prefLang === 'en' || prefLang === 'uk' ? prefLang : undefined;

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
          (session.user as any).status = (token as any).status || 'active';
          (session.user as any).mustChangePassword = !!(token as any).mustChangePassword;
          (session.user as any).locale = (token as any).locale;
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
