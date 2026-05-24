# EZmeet

Self-hosted video-conferencing platform with AI meeting intelligence: live
transcription, automatic summaries, action items, collaborative notes,
reactions, and optional meeting recording.

---

## Install

On a fresh Linux server with a domain pointed at it, **one command** installs
everything — Docker, the full stack, and automatic HTTPS:

```bash
curl -fsSL https://raw.githubusercontent.com/voltergared03/ezmeet/main/install.sh | sudo bash
```

It installs **Docker + Compose** if missing, asks for your **domain** (plus an
optional Let's Encrypt email and AI / Google keys), generates **all secrets**,
and starts the stack behind **Caddy** with an auto-provisioned TLS certificate —
then prints the link to the first-run **`/setup`** wizard. Open it, paste the
one-time token, and you're live. Re-running the command later **updates** the
install in place (secrets and config are preserved).

**Before running it:**

- Point a **DNS A-record** for your domain at the server's public IP.
- Open these ports to the internet: **`80`**, **`443`** (tcp + udp), and the
  WebRTC media ports **`3478/udp`**, **`7881/tcp`**, **`50000–50200/udp`**.
- **~2 GB RAM** minimum (**≥ 4 GB** if you'll enable recording).

> Want your own nginx/Traefik, a custom layout, or no installer? Use the
> [manual install](#manual-install) instead.

---

## Features

- **Video meetings** over WebRTC (LiveKit SFU), guest join links + waiting room
- **Live transcription** (Deepgram, multilingual) streamed into the room
- **AI post-meeting reports** (DeepSeek): summary, decisions, action items, follow-ups
- **Tasks** board, **collaborative notes** with @mentions, **reactions**, screen share
- **Meeting recording** via LiveKit Egress (optional — see [Recording](#recording-livekit-egress))
- **Auth**: Google SSO and/or **email + password** (toggle per workspace), optional **2FA (TOTP)** for admins, admin-managed users + optional **self-registration with approval**
- **Notifications**: in-app, **Web Push** (delivered even when the app/tab is closed) + email (reminders, weekly digest, report-ready, mentions)
- **Installable PWA**: add to home screen, app icons & shortcuts, offline fallback page
- **Admin panel**: users, workspace policies, integrations, usage/cost
- **First-run setup wizard** (`/setup`): configure auth methods, branding & integrations from the browser — zero config-file editing

## Tech stack

| Layer | Tech |
|---|---|
| Frontend / SSR | Next.js 15 (App Router), React 19, TypeScript |
| Auth | NextAuth v5 (Google SSO, JWT) + TOTP 2FA |
| ORM / DB | Prisma 6 + PostgreSQL 16 |
| Realtime / media | LiveKit (SFU) + LiveKit Egress (recording) |
| Agent | Python (`livekit-agents`) — STT + LLM |
| STT / LLM | Deepgram / DeepSeek |
| Cache / coordination | Redis 7 (LiveKit + Egress) |
| Email / storage | SMTP (nodemailer) / S3-compatible (optional) |
| PWA / push | Web App Manifest + service worker + Web Push (VAPID, `web-push`) |
| Infra | Docker Compose, Caddy *or* nginx (TLS reverse proxy) |

---

## Architecture

Services defined in `docker-compose.yml`:

| Service | Role |
|---|---|
| `eam-meet` | Next.js app (API + UI), published on `127.0.0.1:3100` |
| `livekit` | LiveKit SFU (WebRTC) |
| `egress` | LiveKit Egress — records rooms to `/recordings` (a shared volume) |
| `livekit-agent` | Python agent — transcription + AI report |
| `eam-meet-db` | PostgreSQL 16 |
| `eam-meet-redis` | Redis — LiveKit ↔ Egress coordination |

The one-command [installer](#install) adds a **Caddy** container
(`docker-compose.caddy.yml`) that terminates TLS with an automatic Let's Encrypt
certificate and routes `/livekit/*` → LiveKit, everything else → the app.
Alternatively, front EZmeet with your own host reverse proxy (terminate TLS,
forward `/` → `127.0.0.1:3100` and `/livekit/` + `/twirp/` → LiveKit on
`127.0.0.1:7880`); a sample nginx config is in [`app/nginx.conf`](app/nginx.conf).

---

## Prerequisites

- A **Linux server** — the installer adds **Docker + Compose** if they're missing
- A **domain name** with a DNS A-record pointing at the server (e.g. `meet.example.com`)
- **TLS** — issued automatically by the installer's **Caddy** proxy, or bring your own (nginx + certbot)
- A **Google OAuth 2.0 client** for SSO — *optional*, can be added later in `/setup`
- **Deepgram** (STT) + **DeepSeek** (LLM) API keys for AI features — *optional*, add later in admin → Settings
- **RAM**: ~2 GB for app + LiveKit + agent. **Recording adds ~2 GB** while a
  recording is active (Egress runs headless Chrome). Plan for ≥ 4 GB if you
  intend to enable recording, or keep it disabled.

---

## Manual install

Prefer to set things up yourself, or front EZmeet with your own reverse proxy?
The whole stack is plain Docker Compose:

```bash
git clone https://github.com/voltergared03/ezmeet.git && cd ezmeet

# 1. Secrets / config (never commit the real files — they are gitignored)
cp .env.example .env                     # fill in all values
cp livekit.example.yaml livekit.yaml     # set the API key/secret + redis password
cp egress.example.yaml egress.yaml       # MUST match livekit.yaml's key/secret + redis password

# 2. Build & start
docker compose up -d --build

# 3. Create the database schema (first run only)
docker compose exec eam-meet npx prisma db push

# 4. Restart so the app prints a one-time setup token, then read it
docker compose restart eam-meet
docker compose logs eam-meet | grep -A2 SETUP
```

Then finish setup in the browser — no SQL, no config files:

1. Open `https://<your-domain>/setup`
2. Paste the **setup token** from the logs above
3. Set the workspace **name + domain**, then pick your **sign-in method(s)** —
   **Google SSO**, **email + password**, or both
4. Create the first **admin**: sign in with Google (the wizard shows the exact
   redirect URI to authorize in Google Cloud Console) *or* create an email +
   password admin inline. Either way `/setup` locks itself permanently afterward

Optional services (SMTP, Deepgram, DeepSeek, S3) are configured afterwards from
the dashboard **setup checklist** or admin **Settings** — the app already runs
without them.

### Matching secrets (important)

Three values must be **identical** across files or LiveKit/Egress won't work:

| Value | Goes in |
|---|---|
| LiveKit API secret | `.env` (`LIVEKIT_API_SECRET`), `livekit.yaml` (`keys.EAM_MEET_KEY`), `egress.yaml` (`api_secret`) |
| Redis password | `.env` (`REDIS_PASSWORD`), `livekit.yaml` (`redis.password`), `egress.yaml` (`redis.password`) |
| `NEXTAUTH_SECRET` | `.env` only (used for sessions, 2FA, and internal webhook auth) |

### Google OAuth

Create an OAuth 2.0 **Web** client in Google Cloud Console. You don't need to
touch `.env` for this — the first-run **/setup** wizard displays the exact
redirect URI to authorize and lets you paste the client ID/secret there (saved
to the database). Env vars (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) still
work as a fallback if you prefer.

### Reverse proxy (TLS)

Use [`app/nginx.conf`](app/nginx.conf) as a starting point — replace the
`server_name` and certificate paths with your domain. It proxies `/` → app
(`127.0.0.1:3100`) and `/rtc` + `/twirp` → LiveKit (`127.0.0.1:7880`). Obtain
certs with certbot (`certbot --nginx -d meet.example.com`).

---

## Authentication

Two sign-in methods, toggled per workspace in the **/setup** wizard or later in
**Admin → Settings → Sign-in methods** (saved instantly). At least one stays
active at all times, and the workspace **won't let you disable a method that
would lock every admin out** — e.g. turning off Google SSO while no admin has a
password yet.

| Method | Notes |
|---|---|
| **Google SSO** | OAuth 2.0 via NextAuth. On by default when Google credentials are present. |
| **Email + password** | Passwords hashed with **scrypt** (no external service). Off by default. |

**Admin-provisioned users** (Admin → Users → invite) get a temporary password
and are forced to set their own on first login; an email is sent if SMTP is
configured. Admins can **reset** a user's password (Admin → Users → key icon),
and anyone can **set or change their own** under **Profile → Security** — so a
Google-only account can add a password before switching sign-in methods.

### Self-registration (optional)

With email + password enabled, you can let people request their own account.
Requests are **never** auto-approved:

- They appear in **Admin → Users → Registration requests** to approve or deny.
- The applicant sets their own password when requesting; approval activates the
  account as-is.
- Optionally restrict sign-ups with an **email-domain allowlist**.
- Pending requests **expire after 3 days** (configurable) and are swept by the
  hourly `reg-cleanup` cron (see [Scheduled jobs](#recording-livekit-egress)).

> **Backward-compatible:** existing SSO-only deployments are untouched — password
> auth and self-registration remain **off** until an admin enables them.

---

## Configuration

**`.env`** — bootstrap secrets only (DB, Redis, NextAuth, LiveKit, URLs,
`CRON_SECRET`). Google SSO, Deepgram and DeepSeek are *optional* here — they're
normally set in the **/setup** wizard / admin panel. See [`.env.example`](.env.example).

**Runtime config** lives in the database (`SystemConfig` table), set by the
first-run **/setup** wizard and edited later in the **admin panel** (Settings):

| Group | Keys |
|---|---|
| API | `DEEPSEEK_*`, `DEEPGRAM_*` (key / model / language / base URL) |
| Auth | `GOOGLE_CLIENT_ID/SECRET`, `AUTH_GOOGLE_ENABLED`, `AUTH_PASSWORD_ENABLED`, `AUTH_SELFREG`, `AUTH_SELFREG_DOMAINS`, `AUTH_REQUEST_TTL_DAYS` |
| SMTP | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM/FROM_NAME` |
| Workspace | `WS_NAME/TIMEZONE/LANGUAGE/GUEST_ACCESS/AI_SUMMARY/LIVE_TRANSCRIPTION/RECORD_ALL/REQUIRE_2FA/MAX_PARTICIPANTS/MAX_DURATION_MIN/RETENTION_DAYS` |
| Pricing | `PRICE_DEEPSEEK_IN/OUT`, `PRICE_DEEPGRAM_MIN`, `EMAIL_LIMIT` |
| S3 (optional) | `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY/FORCE_PATH_STYLE` |

---

## Notifications & PWA

The app installs as a **Progressive Web App** (manifest + service worker) and
supports **Web Push**, so meeting reminders, task assignments, report-ready and
@mentions reach users even when the tab or installed app is closed.

**Push setup is automatic.** A VAPID keypair is generated on first boot and
stored in `SystemConfig` (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) — no config
files to edit. Push requires HTTPS (already needed for the app). Users opt in
**per device** from **Settings → Notifications** or the bell's prompt.

- **iOS**: push works on iOS 16.4+ **only after** the user installs the PWA
  ("Add to Home Screen").
- **Subject**: pushes use `mailto:admin@<your-domain>`; override with the
  optional `VAPID_SUBJECT` env / config key for a different contact.
- **Offline**: the service worker caches static assets and serves an offline
  fallback page; live routes (`/room`, `/lobby`, `/api`) always hit the network
  and are never cached.

In-app notifications and push share the server's `notify()` helper — push is
just an extra delivery channel, so nothing else needs wiring.

---

## Recording (LiveKit Egress)

The `egress` service records the room (grid composite) to MP4 files in a shared
Docker volume (`eam-meet-recordings`, mounted at `/recordings`), served back
through the app's report card (play / download / keep / delete).

- **Disabled by default.** Enable in **Admin → Workspace** (`WS_RECORD_ALL`) to
  auto-record meetings when they go live.
- **Retention**: set `WS_RETENTION_DAYS` (0 = keep indefinitely). A daily cron
  (`/api/cron/recordings`) deletes expired, non-permanent recordings.
- **Resource cost**: each active recording launches a headless Chrome
  (~1.5–2 GB RAM, ~1–2 CPU). Size your server accordingly.
- Egress requires the shared **Redis** (already wired in `docker-compose.yml` +
  the `redis:` blocks of `livekit.yaml` / `egress.yaml`).

Scheduled jobs (add to the host crontab, using `CRON_SECRET` from `.env`):

```cron
*/5 * * * * curl -s "http://127.0.0.1:3100/api/cron/reminders?secret=$CRON_SECRET" >/dev/null 2>&1
0   9 * * 1 curl -s "http://127.0.0.1:3100/api/cron/digest?secret=$CRON_SECRET"    >/dev/null 2>&1
0   3 * * * curl -s "http://127.0.0.1:3100/api/cron/recordings?secret=$CRON_SECRET" >/dev/null 2>&1
0   * * * * curl -s "http://127.0.0.1:3100/api/cron/reg-cleanup?secret=$CRON_SECRET" >/dev/null 2>&1
```

---

## Updating

```bash
git pull
docker compose build && docker compose up -d
# If the Prisma schema changed:
docker compose exec eam-meet npx prisma db push
```

> **Upgrading an instance created before the `/setup` wizard?** It's auto-detected
> as already configured (an admin exists + Google credentials are present), so the
> wizard won't lock your working deployment. To set the flag explicitly:
>
> ```sql
> INSERT INTO "SystemConfig" (key, value, "updatedAt")
> VALUES ('SETUP_COMPLETE', 'true', now())
> ON CONFLICT (key) DO UPDATE SET value = 'true';
> ```

---

## Security notes

- Real secrets live only in `.env`, `livekit.yaml`, `egress.yaml` — all
  **gitignored**. Commit only the `*.example` templates.
- Email/password sign-in hashes passwords with **scrypt** (Node `crypto`, no
  external service) and is rate-limited per account. Self-registration is
  rate-limited per IP, supports a domain allowlist, avoids account enumeration,
  and always requires explicit admin approval.
- 2FA (TOTP) can be required for admins via `WS_REQUIRE_2FA`. Lockout recovery:
  `UPDATE "User" SET "totpEnabled"=false, "totpSecret"=NULL, "totpBackupCodes"=NULL WHERE email='…';`
- Rotating `NEXTAUTH_SECRET` invalidates all sessions **and** all 2FA secrets /
  backup codes.
- Internal endpoints (transcript/report webhooks, key sync) are authenticated
  with a shared header derived from `NEXTAUTH_SECRET`; the agent sends it
  automatically.
