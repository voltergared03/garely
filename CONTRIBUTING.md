# Contributing to Garely

Thanks for your interest! Garely is licensed **AGPL-3.0** — by contributing you
agree your changes are released under the same license.

## Project layout

| Path | What |
|---|---|
| `app/` | Next.js 15 (App Router) application — UI + API routes |
| `agent/` | Python LiveKit agent (per-participant Deepgram STT) |
| `docker-compose.yml`, `install.sh`, `Caddyfile.example` | Self-hosted deployment |

## Local development

Requirements: **Node 20+** and a **PostgreSQL** database (Redis is optional).

```bash
cd app
cp ../.env.example ../.env     # set at least DATABASE_URL + NEXTAUTH_SECRET
npm install
npm run db:push               # apply the Prisma schema
npm run dev                   # http://localhost:3000
```

Most product configuration (Google SSO, SMTP, AI keys, workspace name) is set at
runtime in the first-run `/setup` wizard and admin Settings — **not** in env.

## Checks — run before opening a PR

```bash
npm run test           # vitest: unit + integration
npm run test:coverage  # coverage of the server libs + API routes
npx tsc --noEmit       # type-check
npm run build          # production build
```

All four must pass. CI (`.github/workflows/ci.yml`) runs the same set.

## Testing conventions

- Tests live next to the code as `*.test.ts` (`.test.tsx` for components, which
  opt into jsdom with a `// @vitest-environment jsdom` docblock).
- **Route handlers** are tested by importing their `GET`/`POST` and calling them
  with the helpers in `src/test/helpers.ts` (`mockSession`, `jsonReq`, `ctx`).
  Prisma is mocked via `vi.mock('@/lib/prisma')` + `src/lib/__mocks__/prisma.ts`
  (a `vitest-mock-extended` deep mock); `auth()` and external libs are mocked too.
- **Coverage** (`npm run test:coverage`) is measured over `src/lib` + `src/app/api`
  — the unit/integration-testable surface. React pages/components are verified in
  the browser today; component/e2e tests are a roadmap item. A regression-floor
  threshold is enforced on the coverage run (raise it as coverage grows).

## Code conventions

- **TypeScript strict.** Avoid `as any`; the NextAuth session/JWT are typed in
  `src/types/next-auth.d.ts`.
- **Styling** is inline styles + CSS variables (no Tailwind). Reuse the dark-theme
  vars (`--bg`, `--surface`, `--border`, `--text`, `--accent`, …).
- **i18n** via next-intl: every user-facing string needs both an `en` and a `uk`
  key — `messages.test.ts` enforces parity.
- **API routes**: wrap handlers in `withRoute()` for uniform error handling; gate
  access with `requireAuth` / `requireAdmin` / `requireMeetingAccess`; validate
  request bodies with `validateBody` (zod). Return errors via `jsonError`.
- Schema changes use `prisma db push` (the project does not use migrations).

## Commits & PRs

- Conventional, imperative, area-prefixed messages (e.g. `Reports: …`,
  `Calendar: …`). Keep each commit focused.
- Create a **new** commit rather than amending already-pushed work.
- Describe the *why* in the PR body; include a short test plan.

## Deploying (maintainers)

The app deploys by rsyncing `app/src` to the server and rebuilding the app
container:

```bash
rsync -az app/src/ <server>:/opt/eam-meet/app/src/
ssh <server> 'cd /opt/eam-meet && docker compose build eam-meet && docker compose up -d --force-recreate eam-meet'
```

Bumping a dependency or the version also requires rsyncing `app/package.json` +
`app/package-lock.json`. Never commit real secrets — `.env`, `livekit.yaml`,
`egress.yaml`, and `Caddyfile` are gitignored (use the `*.example` templates).
