# Changelog

All notable changes to Garely are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project currently
ships `beta` tags ahead of a 1.0 public release.

## [1.13.0-beta.1] — 2026-06-06

**The "work OS" release.** Garely grows from a meeting app into a self-hosted
work platform: a built-in database, tasks rebuilt on top of it, and an AI layer
that turns meetings into decisions and assigned work — all on your own server.

### Added
- **Rebrand to Garely.** New name, interlock logo mark + wordmark, and docs
  (formerly EZmeet / EAM Meet). Product brand is decoupled from your workspace name.
- **Multi-tenancy foundation.** Every record now belongs to an Organization
  (single-database, `orgId`-scoped throughout) — the groundwork for a clean
  self-host first-run and a future hosted/multi-org cloud.
- **A native database engine** (Airtable / Teable-style), built in: Base → Table →
  Field → Record → Views (**grid, kanban, calendar**), ~18 field types (text,
  long text, number, currency, percent, rating, single/multi-select, date, person,
  checkbox, URL, email, phone, file/attachment, **TOTP 2FA code**, encrypted
  **password**, and two-way **link/relations**), filters & sorts, resizable and
  drag-reorderable columns & rows, a row context menu (insert ×N / duplicate /
  copy link / comment / delete), multi-select + bulk actions, **record comments**
  and attachments, and **per-base sharing by email** (roles + hidden columns).
- **Tasks, rebuilt on the engine.** Tasks are now records in that database, which
  unlocks **custom fields on tasks** — set them on create, edit them in the task
  drawer, see them as chips on the board, and filter the board by select fields.
  Plus multiple assignees and inline subtasks.
- **AI that does the work (the moat):**
  - The AI now **fills your custom task fields** straight from the meeting transcript.
  - **Decisions registry** — every decision your meetings make is extracted into a
    searchable registry (with owners), organised by meeting, with per-decision
    access control, inline **edit/delete**, and a backfill for existing reports.
  - A **weekly "where to focus" AI rollup** at the top of the digest email.
  - AI auto-assigns people, subtasks and the right department to action items.
- **Remote access — in-browser RDP** *(folded into this beta on 2026-06-09):*
  - **Connect to your RDP servers from the browser**, no client to install — a
    Rust/WASM **IronRDP** client streams the desktop through a self-hosted
    **Devolutions Gateway** (RDCleanPath over WSS); the page is the full client
    (display, keyboard, mouse, **NLA/CredSSP**).
  - **Encrypted credential vault** (AES-256-GCM) with **per-server access control**
    by user or department; every connection is audit-logged.
  - **Shared clipboard** both ways, **file drag-and-drop**, **dynamic 1:1 resolution**
    that follows the browser window and re-fits live, and **live presence** — everyone
    with access sees when a server is in use and by whom.
  - **Keyboard-layout sync** — Unicode keyboard mode types the character you pressed
    (Ukrainian, Russian, etc.) regardless of the server's active layout; a macOS
    **⌘→Ctrl** mapping with self-healing modifier state so a swallowed ⌘ keyup (e.g.
    after switching input source) never leaves typing stuck.
  - **Draggable session status pill** — reposition the server/disconnect chip anywhere
    over the canvas; the position persists across reconnects.

### Changed / Fixed
- **Self-host first-run hardening.** The Google-SSO setup path now provisions the
  first Organization (a fresh Google-only install no longer comes up without an
  org); integration status detects Google credentials via the database **and** env;
  `.env.example` spells out which services matter (DeepSeek = core, SMTP =
  recommended, Deepgram = opt-in).
- Meeting invitations send the `.ics` as a proper calendar alternative with a
  correct ORGANIZER/ATTENDEE; reports show **all** assignees, not just the lead.
- Database home bento layout, grid viewport-fit, and assorted polish.
- Calendar month view no longer nests interactive controls: a day cell is now a
  keyboard-operable container (not a `<button>`), so the task-deadline chips
  inside it are valid — clearing the React hydration warning.
- **Tasks — dense, sortable table.** The desktop list/department views are now a
  proper data-grid (Task · Priority · Assignee · Due · Subtasks · Department/Status)
  with click-to-sort headers, tabular dates, overdue/soon colour, and an inline
  "add a task" row per group; mobile keeps the stacked cards, Kanban is unchanged.
- **Meetings — entry window + "Start now".** A scheduled meeting can be joined only
  from 5 minutes before it starts; earlier, only the host/admin can start it via a
  "Start now" button (enforced server-side in the join-token route). This also fixes
  a bug where opening a future meeting early flipped it to `live` and an empty-room
  webhook then ended it — wrongly dropping it into the archive. The cleanup cron no
  longer auto-ends meetings whose start is still in the future.
- **Calendar keeps history.** Past, ended and cancelled meetings now stay on the
  calendar greyed-out instead of vanishing; the Archive remains the dedicated list.

## [1.12.0-beta.1] — 2026-06-03

### Added
- **Personal calendar subscription (ICS).** Each user gets a private feed URL
  in *Settings → Calendar sync* to subscribe to **their own meetings and task
  deadlines** from Google Calendar, Outlook or Apple Calendar. One-way, the
  secret URL is the credential, and regenerating it revokes old subscriptions.
- **Email notifications for tasks.** You get an email (and in-app notification)
  when a task is **assigned** to you, and when a task's **status or due date
  changes** — sent to the assignee and collaborators, never to the person who
  made the change, and only on a real change. Honours the per-user task
  notification toggle.
- **Email + calendar invitations for meetings.** Scheduling a meeting now emails
  everyone (creator + participants/guests) an invitation with an attached `.ics`
  plus **Join**, **Add to Google Calendar** and **Add to calendar (.ics)** buttons
  — so it drops straight into Google / Outlook / Apple Calendar. Rescheduling
  sends an update; deleting sends a cancellation.

### Changed
- **Manage subtasks inline on the Tasks board.** Each task row has a disclosure
  caret that expands its subtasks in place — toggle status, see the assignee,
  delete, and quick-add (Enter) without opening the task. The parent row shows a
  progress meter (done / total).
- **Task details open in a side panel** — a right-hand, full-height drawer
  instead of a centred modal, keeping subtasks, comments, files and collaborators
  together; on phones it becomes a full-screen sheet.
- **Animated sign-in background** — a subtle, accent-tinted "flowing paths"
  backdrop on the login screen (CSS-only, hair-thin lines, honours
  `prefers-reduced-motion`).

## [1.11.0-beta.1] — 2026-06-03

**Departments & a real task workspace.** Tasks gain org structure, collaboration,
and a role-aware calendar — turning the post-meeting task list into a place work
actually happens.

### Added
- **Departments (org structure).** Admins create departments (name + colour) in
  *Settings → Departments* and assign members (with an optional lead). Meetings
  and tasks can belong to a department. A task's **effective department** is its
  explicit one, else its **assignee's** department — so moving a person into a
  department automatically attributes their tasks to it.
- **Access gating by department.** Non-admins see their **own** tasks, their
  **meetings'** tasks, their **department's** tasks, and tasks they **collaborate**
  on; admins see everything. The Tasks board adds a **By department** grouped view
  and a department filter; admins also get a department filter on the calendar.
- **Subtasks.** Break a task into a checklist of subtasks (one level), each
  toggleable and assignable; the board shows a subtask count.
- **Comments.** A threaded discussion per task. The assignee, collaborators and
  the task's department are notified of new comments; explicit @mentions notify
  the mentioned teammate (gated to people who can already see the task).
- **File attachments.** Upload files to a task (stored in a dedicated Docker
  volume, 25 MB each); download is authenticated and always served as an
  attachment. Uploader or an admin can delete.
- **Collaborators.** Add extra people to a task beyond the assignee; they get the
  task in their lists, on their calendar, and a notification when added.
- **Tasks on the calendar, role-scoped.** Task (and subtask) deadlines appear on
  the calendar within each person's access scope; clicking one opens the task.

### Changed
- The Tasks page modal now hosts the full task workspace — details plus a
  **Subtasks / Comments / Files** panel and a collaborators row.

## [1.10.0-beta.1] — 2026-05-30

A **mobile & in-meeting UX** pass. This entry also **consolidates the 1.6.0–1.9.0
betas** (those standalone releases were retired in favour of one rolling release).

### Added
- **Start a quick meeting from mobile.** The mobile compose (+) button is now a
  **speed-dial** offering *Quick meeting* (start now) or *Schedule*, and the
  dashboard exposes both as cards — previously phones could only schedule.

### Changed
- **Simplified in-meeting controls.** The bottom bar went from ~14 flat buttons
  to a focused core — mic, camera, screen share, reactions — plus a **⋮ More**
  menu (record, invite, device pickers) and a single **Panel** button. The five
  separate side-panel buttons (participants, chat, transcript, notes, AI) are now
  **tabs inside one panel**. On phones the bar stays compact: screen share and the
  device pickers fold into the ⋮ menu.
- **Quizzes moved into the Tasks page** as a `Tasks | Quizzes` tab (web + mobile),
  with the pending-quiz reminder badge now on Tasks. This frees a slot in the
  mobile bottom bar; `/quizzes` redirects to the new tab.

### Fixed
- The in-call **device pickers now show the device actually in use** (and the
  default speaker) instead of "Not found".

### Also in this release (consolidated from 1.6.0–1.9.0)

- **Comprehension quizzes** (was 1.9.0). From a finished meeting's report, an
  admin or the creator can generate AI multiple-choice questions, edit / add /
  remove them, choose open- or closed-book, and assign to participants. Assignees
  take a mobile-friendly, **auto-graded** quiz (one attempt); creators are
  notified of each result. A "Quizzes" hub shows everyone their assigned quizzes
  and gives admins/creators each participant's score with an answer review.
  Quizzes can be deleted.
- **Recording rebuild** (was 1.8.0). **On-demand recording** — start/stop from a
  Record button inside the meeting (host/admin) instead of an all-or-nothing
  setting; the REC indicator now reflects the real recording state for everyone.
  Transcript segments from one continuous turn are **coalesced** into
  paragraph-sized rows.
- **Recurring meetings & polish** (was 1.7.0). Recurring meetings
  **auto-materialize** their next occurrence (missed slots skipped); report and
  archive render times in the **workspace timezone**; accessibility aria-labels on
  icon-only buttons.
- **Security & reliability** (was 1.6.0). Tightened **authorization** on tasks,
  recordings and per-speaker tracks; upgraded `nodemailer` (clears an
  SMTP-injection advisory); added security headers (CSP `frame-ancestors` /
  `X-Frame-Options` / `nosniff` / `Referrer-Policy`); report generation status
  with a Retry button; **automated daily DB backups** (rotated, kept 14); a
  state-cleanup cron; ops hardening (healthchecks, log rotation, memory limits);
  a clean `scheduled → live → ended` meeting status machine; DB indexes.

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

[1.10.0-beta.1]: https://github.com/voltergared03/garely/releases/tag/v1.10.0-beta.1
[1.5.0-beta.1]: https://github.com/voltergared03/garely/releases/tag/v1.5.0-beta.1
[1.4.0-beta.1]: https://github.com/voltergared03/garely/releases/tag/v1.4.0-beta.1
[1.3.0-beta.1]: https://github.com/voltergared03/garely/releases/tag/v1.3.0-beta.1
[1.2.0-beta.1]: https://github.com/voltergared03/garely/releases/tag/v1.2.0-beta.1
[1.0.0-beta.1]: https://github.com/voltergared03/garely/releases/tag/v1.0.0-beta.1
