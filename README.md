# EAM Meet

Self-hosted video-conferencing platform with AI meeting intelligence: live
transcription, automatic summaries, action items, collaborative notes,
reactions, and optional meeting recording.

---

## Features

- **Video meetings** over WebRTC (LiveKit SFU), guest join links + waiting room
- **Live transcription** (Deepgram, multilingual) streamed into the room
- **AI post-meeting reports** (DeepSeek): summary, decisions, action items, follow-ups
- **Tasks** board, **collaborative notes** with @mentions, **reactions**, screen share
- **Meeting recording** via LiveKit Egress (optional — see [Recording](#recording-livekit-egress))
- **Auth**: Google SSO (NextAuth) + optional **2FA (TOTP)** for admins
- **Notifications**: in-app + email (reminders, weekly digest, report-ready, mentions)
- **Admin panel**: users, workspace policies, integrations, usage/cost
- **First-run setup wizard** (`/setup`): configure SSO, branding & integrations from the browser — zero config-file editing

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
| Infra | Docker Compose, nginx (TLS reverse proxy) |

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

An nginx reverse proxy on the host terminates TLS and forwards `/` to the app
and `/rtc` + `/twirp` to LiveKit. A sample config is in [`app/nginx.conf`](app/nginx.conf).

---

## Prerequisites

- A Linux server with **Docker** + **Docker Compose**
- A **domain name** with DNS pointing at the server (e.g. `meet.example.com`)
- **TLS** (nginx + Let's Encrypt / certbot, or your own certs)
- A **Google OAuth 2.0 client** (for SSO)
- A **Deepgram** API key (speech-to-text) and a **DeepSeek** API key (LLM)
- **RAM**: ~2 GB for app + LiveKit + agent. **Recording adds ~2 GB** while a
  recording is active (Egress runs headless Chrome). Plan for ≥ 4 GB if you
  intend to enable recording, or keep it disabled.

---

## Quick start

```bash
git clone <your-repo-url> eam-meet && cd eam-meet

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
3. Set the workspace **name + domain**, then your **Google OAuth** client ID/secret
   — the wizard shows the exact redirect URI to register in Google Cloud Console
4. Click **Sign in with Google**: the first account to sign in becomes the
   **admin**, and `/setup` locks itself permanently

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

## Configuration

**`.env`** — bootstrap secrets only (DB, Redis, NextAuth, LiveKit, URLs,
`CRON_SECRET`). Google SSO, Deepgram and DeepSeek are *optional* here — they're
normally set in the **/setup** wizard / admin panel. See [`.env.example`](.env.example).

**Runtime config** lives in the database (`SystemConfig` table), set by the
first-run **/setup** wizard and edited later in the **admin panel** (Settings):

| Group | Keys |
|---|---|
| API | `DEEPSEEK_*`, `DEEPGRAM_*` (key / model / language / base URL) |
| SMTP | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM/FROM_NAME` |
| Workspace | `WS_NAME/TIMEZONE/LANGUAGE/GUEST_ACCESS/AI_SUMMARY/LIVE_TRANSCRIPTION/RECORD_ALL/REQUIRE_2FA/MAX_PARTICIPANTS/MAX_DURATION_MIN/RETENTION_DAYS` |
| Pricing | `PRICE_DEEPSEEK_IN/OUT`, `PRICE_DEEPGRAM_MIN`, `EMAIL_LIMIT` |
| S3 (optional) | `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY/FORCE_PATH_STYLE` |

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
- 2FA (TOTP) can be required for admins via `WS_REQUIRE_2FA`. Lockout recovery:
  `UPDATE "User" SET "totpEnabled"=false, "totpSecret"=NULL, "totpBackupCodes"=NULL WHERE email='…';`
- Rotating `NEXTAUTH_SECRET` invalidates all sessions **and** all 2FA secrets /
  backup codes.
- Internal endpoints (transcript/report webhooks, key sync) are authenticated
  with a shared header derived from `NEXTAUTH_SECRET`; the agent sends it
  automatically.
