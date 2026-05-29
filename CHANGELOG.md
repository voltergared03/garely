# Changelog

All notable changes to EZmeet are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project currently
ships `beta` tags ahead of a 1.0 public release.

## [1.6.0-beta.1] — 2026-05-29

A **security & reliability** release driven by a full code audit (security,
correctness, and self-hosted ops), plus the deferred polish.

### Security
- **Tasks API authorization**: standalone (meeting-less) tasks could be edited or
  deleted by any authenticated user; now restricted to the assignee or an admin.
  Replaced request-body spreads with strict field whitelists on `/api/tasks` and
  `/api/meetings/[id]/tasks` (no more mass-assignment of `meetingId`/`source`/etc).
- **Recordings**: making a recording permanent or deleting it is now limited to
  an admin or the meeting creator (was any participant).
- **Per-speaker tracks**: added the missing meeting-access check (was readable by
  any signed-in user).
- **Self-registration**: approving a request whose email already exists now
  returns a clear error instead of silently marking it approved.
- **Dependencies**: upgraded `nodemailer` 6 → 8 (clears a high-severity
  SMTP-injection advisory).
- **HTTP headers**: added `X-Frame-Options` / CSP `frame-ancestors` (clickjacking),
  `X-Content-Type-Options: nosniff`, and `Referrer-Policy`.

### Added
- **Report generation status**: reports now track `generating | ready | failed`;
  the report page shows a generating spinner (auto-refresh) or a failure state
  with a **Retry** button instead of a generic "not found". The meeting is always
  marked ended even if the AI step fails.
- **Automated database backups**: a `db-backup` service writes a rotated daily
  `pg_dump` (keeps 14) to a dedicated volume.
- **State-cleanup job** (`/api/cron/cleanup`, every 30 min): ends meetings stuck
  `live` long past their expected end, and marks recordings stuck `processing` as
  failed.

### Changed
- **Ops hardening**: JSON log rotation on every container; an app healthcheck
  (`/api/setup/status`) with dependents waiting on it; memory limits on every
  service plus a hard cap on the recording (egress) container so it can't OOM the
  host; pinned dependency conditions.
- **Meeting status**: removed the undocumented `active` state — meetings go
  `scheduled → live → ended` and no longer get stuck invisibly between lists.
- **Timezone**: editing a scheduled meeting now renders and saves its time in the
  workspace timezone (no more silent shifts when the browser is in another zone).
- **Performance**: added DB indexes (`Meeting(status, scheduledAt)`,
  `MeetingReport(meetingId)`); `GET /api/meetings` is now bounded (newest 200 by
  default, `?limit=` up to 500).

### Fixed
- Tasks page: the loading state never reflected the fetch and errors were
  swallowed, so an API failure looked like "no tasks" — added real loading and
  error states.
- Localized hardcoded strings (report section titles / AI-Report chip / PDF
  labels, and mention-notification fallbacks).
- Build: `npm ci` could fail on the nodemailer peer-dependency conflict; pinned
  `legacy-peer-deps`. The `vitest` config no longer breaks `tsc` / `next build`.

### Known limitations (roadmap)
- Recurring meetings are recorded but occurrences are still created manually
  (auto-materialization needs series linkage — planned).
- Report/Archive **display** times use the browser zone (the edit form is fixed);
  a broader accessibility (aria-label) pass is also pending.

## [1.5.0-beta.1] — 2026-05-26

A foundational **quality & hardening** release driven by a code audit — no new
user-facing features, plus one user-facing fix.

### Added
- Test suite expanded **24 → 122** across 21 files: integration tests for the 12
  most security-critical API routes (set-password token lifecycle, tasks
  scope/authorization, invite, admin password reset, self-registration
  anti-enumeration, webhook auth, join-token, guest join, admit, recording
  access) plus unit tests for the core authz primitive, route guards,
  rate-limiter, validation, error wrapper, password and i18n parity. Prisma
  deep-mock test harness.
- Structured JSON logger and a `withRoute()` error wrapper adopted across the
  API — uniform try/catch + structured error logs (routes without error handling
  went **36 → 1**).
- Error tracking via a Sentry-envelope reporter (self-hosted GlitchTip
  compatible), enabled by setting `SENTRY_DSN`.
- Redis-backed rate limiting with a transparent in-process fallback.
- `zod` request-body validation (foundation + task creation).
- Test-coverage reporting: `npm run test:coverage`.

### Changed
- Split the four largest components into focused files: settings 1581→69,
  calendar 1983→350 (fully), report 2245→1813 and room 1405→1205 (lib +
  presentational extracted).
- Typed the NextAuth session/JWT — removed **124 `as any` casts** (318 → 194).
- Extracted shared primitives (secret resolution, SSE parser, HTTP/route-guard
  helpers, email escaping, UI Spinner/Modal/useTransientMessage).
- The production 2FA secret now fails closed (never falls back to a dev constant).

### Fixed
- Dashboard React #418 hydration error: dates/times render against the workspace
  timezone so server and client produce identical markup.

## [1.4.0-beta.1] — 2026-05-26

### Added
- Grounded per-meeting **AI chat** on the report (streaming answers, clickable
  transcript citations).
- Calendar shows **task deadlines** alongside scheduled meetings.
- Invited users **set their own password** via a one-time link.
- Admins are **emailed on new self-registrations**; admins can **rename users**.

### Changed
- Admin Users list redesigned into a single aligned row.

### Fixed
- User-facing email links now use the public URL (were pointing at the internal
  Docker host).

## [1.3.0-beta.1] — 2026-05-25

### Added
- Topic-structured **"Detailed" reports** with clickable transcript citations;
  the extended report is also included in the PDF export.

## [1.2.0-beta.1] — 2026-05-25

### Added
- **Per-speaker multilingual transcription** (uk/ru/en): per-participant Deepgram
  STT, post-meeting language detection (with a UI-language prior to break the
  uk↔ru tie), and a report "fix language & regenerate" flow.

## [1.0.0-beta.1]

### Added
- Initial public beta: video meetings (LiveKit SFU), live transcription, AI
  summaries / action items, collaborative notes, reactions, optional recording,
  installable PWA with push notifications, full uk/en i18n, and a self-hosted
  one-command installer with automatic HTTPS.

[1.6.0-beta.1]: https://github.com/voltergared03/ezmeet/releases/tag/v1.6.0-beta.1
[1.5.0-beta.1]: https://github.com/voltergared03/ezmeet/releases/tag/v1.5.0-beta.1
[1.4.0-beta.1]: https://github.com/voltergared03/ezmeet/releases/tag/v1.4.0-beta.1
[1.3.0-beta.1]: https://github.com/voltergared03/ezmeet/releases/tag/v1.3.0-beta.1
[1.2.0-beta.1]: https://github.com/voltergared03/ezmeet/releases/tag/v1.2.0-beta.1
[1.0.0-beta.1]: https://github.com/voltergared03/ezmeet/releases/tag/v1.0.0-beta.1
