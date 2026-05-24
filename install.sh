#!/usr/bin/env bash
#
# EZmeet — one-command installer.
#
#   curl -fsSL https://raw.githubusercontent.com/voltergared03/ezmeet/main/install.sh | sudo bash
#
# Installs Docker (if missing), fetches EZmeet, asks a few questions, generates
# all secrets, brings up the full stack behind Caddy with automatic HTTPS, and
# prints the link to the first-run /setup wizard. Re-running it updates an
# existing install in place (your config + secrets are kept).
#
set -euo pipefail

# ── Settings (override via env) ─────────────────────────────────────────────
REPO_URL="${EZMEET_REPO:-https://github.com/voltergared03/ezmeet.git}"
BRANCH="${EZMEET_BRANCH:-main}"
INSTALL_DIR="${EZMEET_DIR:-/opt/ezmeet}"
PRISMA_VERSION="6.2.0"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.caddy.yml"

# ── Pretty output ───────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; R=$'\033[0m'
  CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'
else
  B=""; DIM=""; R=""; CYAN=""; GREEN=""; YELLOW=""; RED=""
fi
info()  { printf '%s\n' "${CYAN}•${R} $*"; }
ok()    { printf '%s\n' "${GREEN}✓${R} $*"; }
warn()  { printf '%s\n' "${YELLOW}!${R} $*"; }
err()   { printf '%s\n' "${RED}✗ $*${R}" >&2; }
die()   { err "$*"; exit 1; }
step()  { printf '\n%s\n' "${B}${CYAN}▸ $*${R}"; }

banner() {
  printf '%s' "$CYAN"
  cat <<'ART'
   ___ ____                _
  / _ \___ \ _ __ ___  ___| |_
 | (_) |__) | '_ ` _ \/ _ \ __|
  \__, / __/| | | | | |  __/ |_
    /_/_____|_| |_| |_|\___|\__|   self-hosted meetings + AI
ART
  printf '%s\n' "$R"
}

# ── Interactive input (works under `curl | bash` via /dev/tty) ──────────────
HAS_TTY=0
if [ -e /dev/tty ] && (: >/dev/tty) 2>/dev/null; then HAS_TTY=1; fi

# prompt_var VARNAME "Question" "default" [required]
prompt_var() {
  local var="$1" text="$2" default="${3:-}" mode="${4:-optional}" reply p
  if [ -n "${!var:-}" ]; then return; fi          # already provided via env
  if [ "$HAS_TTY" = "1" ]; then
    p="  ${B}${text}${R}"; [ -n "$default" ] && p="$p ${DIM}[$default]${R}"
    printf '%s: ' "$p" >/dev/tty
    IFS= read -r reply </dev/tty || reply=""
    reply="${reply:-$default}"
  else
    reply="$default"
  fi
  if [ -z "$reply" ] && [ "$mode" = "required" ]; then
    die "'$text' is required. Re-run interactively or pass it via the matching env var."
  fi
  printf -v "$var" '%s' "$reply"
}

gen_secret() { openssl rand -hex 32; }

pkg_install() {
  if   command -v apt-get >/dev/null 2>&1; then DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
  elif command -v dnf     >/dev/null 2>&1; then dnf install -y "$@"
  elif command -v yum     >/dev/null 2>&1; then yum install -y "$@"
  elif command -v apk     >/dev/null 2>&1; then apk add --no-cache "$@"
  elif command -v pacman  >/dev/null 2>&1; then pacman -Sy --noconfirm "$@"
  else return 1; fi
}

# ── Pre-flight ──────────────────────────────────────────────────────────────
banner
step "Pre-flight checks"

[ "$(uname -s)" = "Linux" ] || die "This installer targets Linux servers. For local/dev use, see the manual docker-compose path in the README."
[ "$(id -u)" -eq 0 ] || die "Please run as root, e.g.:  curl -fsSL <url>/install.sh | sudo bash"

for tool in curl git openssl; do
  command -v "$tool" >/dev/null 2>&1 && continue
  info "Installing missing dependency: $tool"
  pkg_install "$tool" || die "Could not install '$tool' automatically — please install it and re-run."
done
ok "Base tools present (curl, git, openssl)"

# Docker + Compose v2
if ! command -v docker >/dev/null 2>&1; then
  step "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  info "Installing the Docker Compose plugin"
  pkg_install docker-compose-plugin || die "Docker Compose v2 plugin is required. Install it and re-run."
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start it and re-run."
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') + Compose ready"

# ── Fetch / update the code ─────────────────────────────────────────────────
step "Fetching EZmeet → $INSTALL_DIR"
FRESH=1
if [ -d "$INSTALL_DIR/.git" ]; then
  FRESH=0
  info "Existing checkout found — updating"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
ok "Source ready ($(git -C "$INSTALL_DIR" rev-parse --short HEAD))"

EXISTING_ENV=0
[ -f "$INSTALL_DIR/.env" ] && EXISTING_ENV=1

# ── Configure ───────────────────────────────────────────────────────────────
if [ "$EXISTING_ENV" = "1" ]; then
  step "Existing configuration detected"
  ok "Keeping your .env, livekit.yaml, egress.yaml and secrets unchanged"
  warn "To change the domain or secrets, edit $INSTALL_DIR/.env (and Caddyfile) by hand."
else
  step "Configuration"
  [ "$HAS_TTY" = "1" ] || warn "No terminal detected — using defaults / env vars for all answers."

  prompt_var EZMEET_DOMAIN     "Domain (DNS A-record must already point here)" "" required
  prompt_var EZMEET_TLS_EMAIL  "Email for Let's Encrypt (recommended, optional)" ""
  echo
  info "AI + Google sign-in are optional — press Enter to skip and configure them"
  info "later in the browser at ${B}https://$EZMEET_DOMAIN/setup${R}."
  prompt_var GOOGLE_CLIENT_ID      "Google OAuth Client ID (optional)" ""
  prompt_var GOOGLE_CLIENT_SECRET  "Google OAuth Client Secret (optional)" ""
  prompt_var DEEPGRAM_API_KEY      "Deepgram API key — live transcription (optional)" ""
  prompt_var DEEPSEEK_API_KEY      "DeepSeek API key — AI reports (optional)" ""

  step "Generating secrets + config files"
  PG_PASS="$(gen_secret)"
  REDIS_PASS="$(gen_secret)"
  NEXTAUTH_SECRET="$(gen_secret)"
  LIVEKIT_SECRET="$(gen_secret)"
  CRON_SECRET="$(gen_secret)"

  umask 077
  {
    echo "# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ) — DO NOT COMMIT"
    echo "POSTGRES_DB=eam_meet"
    echo "POSTGRES_USER=eam_meet"
    echo "POSTGRES_PASSWORD=$PG_PASS"
    echo "DATABASE_URL=postgresql://eam_meet:$PG_PASS@eam-meet-db:5432/eam_meet"
    echo
    echo "REDIS_PASSWORD=$REDIS_PASS"
    echo
    echo "NEXTAUTH_URL=https://$EZMEET_DOMAIN"
    echo "NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
    echo "AUTH_TRUST_HOST=true"
    echo
    echo "PUBLIC_URL=https://$EZMEET_DOMAIN"
    echo "APP_URL=http://eam-meet:3000"
    echo
    echo "LIVEKIT_API_KEY=EAM_MEET_KEY"
    echo "LIVEKIT_API_SECRET=$LIVEKIT_SECRET"
    echo "LIVEKIT_URL=wss://$EZMEET_DOMAIN/livekit"
    echo "LIVEKIT_WS_URL=ws://livekit:7880"
    echo
    echo "CRON_SECRET=$CRON_SECRET"
    echo
    echo "# Reverse proxy (Caddy auto-HTTPS)"
    echo "EZMEET_DOMAIN=$EZMEET_DOMAIN"
    echo "EZMEET_TLS_EMAIL=$EZMEET_TLS_EMAIL"
    if [ -n "${GOOGLE_CLIENT_ID:-}" ]; then
      echo
      echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
      echo "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}"
    fi
    if [ -n "${DEEPGRAM_API_KEY:-}" ]; then echo "DEEPGRAM_API_KEY=$DEEPGRAM_API_KEY"; fi
    if [ -n "${DEEPSEEK_API_KEY:-}" ]; then echo "DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY"; fi
  } > "$INSTALL_DIR/.env"

  cat > "$INSTALL_DIR/livekit.yaml" <<EOF
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 50200
  use_external_ip: true
  tcp_port: 7881
keys:
  EAM_MEET_KEY: $LIVEKIT_SECRET
room:
  auto_create: false
  max_participants: 20
  empty_timeout: 300
webhook:
  urls:
    - http://eam-meet:3000/api/webhooks/livekit
  api_key: EAM_MEET_KEY
logging:
  level: info
redis:
  address: eam-meet-redis:6379
  password: $REDIS_PASS
EOF

  cat > "$INSTALL_DIR/egress.yaml" <<EOF
redis:
  address: eam-meet-redis:6379
  password: $REDIS_PASS
api_key: EAM_MEET_KEY
api_secret: $LIVEKIT_SECRET
ws_url: ws://livekit:7880
log_level: info
EOF

  # Caddyfile (domain baked in; optional ACME email as a global block)
  {
    if [ -n "${EZMEET_TLS_EMAIL:-}" ]; then
      printf '{\n    email %s\n}\n\n' "$EZMEET_TLS_EMAIL"
    fi
    cat <<EOF
$EZMEET_DOMAIN {
    encode zstd gzip
    header Permissions-Policy "display-capture=(self)"
    request_body {
        max_size 50MB
    }

    # LiveKit signaling WebSocket + API (strip the /livekit prefix)
    handle_path /livekit/* {
        reverse_proxy livekit:7880
    }
    # LiveKit Twirp API
    handle /twirp/* {
        reverse_proxy livekit:7880
    }
    # Next.js app (everything else)
    handle {
        reverse_proxy eam-meet:3000
    }
}
EOF
  } > "$INSTALL_DIR/Caddyfile"
  umask 022

  ok "Wrote .env, livekit.yaml, egress.yaml, Caddyfile (secrets auto-generated)"
fi

# ── Firewall (best effort) ──────────────────────────────────────────────────
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  step "Opening required ports in ufw"
  for p in 80/tcp 443/tcp 443/udp 3478/udp 7881/tcp 50000:50200/udp; do
    ufw allow "$p" >/dev/null 2>&1 || true
  done
  ok "ufw rules added"
fi

# ── Build + launch ──────────────────────────────────────────────────────────
step "Building and starting the stack (first run can take a few minutes)"
$COMPOSE up -d --build

# ── Database schema ─────────────────────────────────────────────────────────
step "Applying the database schema"
DBOK=0
for attempt in 1 2 3; do
  if $COMPOSE run --rm --no-deps --user root -T eam-meet \
        npx -y "prisma@$PRISMA_VERSION" db push --schema=/app/prisma/schema.prisma --skip-generate; then
    DBOK=1; break
  fi
  warn "Schema push attempt $attempt failed — retrying in 5s"; sleep 5
done
[ "$DBOK" = "1" ] || die "Could not apply the database schema. Check logs: $COMPOSE logs eam-meet-db"
$COMPOSE up -d eam-meet >/dev/null 2>&1 || true
ok "Database ready"

# ── Wait for the app, then surface the setup token ──────────────────────────
step "Waiting for the app to become ready"
READY=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:3100/api/setup/status" 2>/dev/null; then READY=1; break; fi
  sleep 2
done
[ "$READY" = "1" ] && ok "App is up" || warn "App didn't answer in time — it may still be starting."

DOMAIN_FROM_ENV="$(grep -E '^PUBLIC_URL=' "$INSTALL_DIR/.env" | cut -d= -f2- | sed 's#/*$##' || true)"
SETUP_BLOCK="$($COMPOSE logs eam-meet 2>&1 | sed -n '/FIRST-RUN SETUP REQUIRED/,/deleted once setup completes/p' || true)"
TOKEN=""
if [ -z "$SETUP_BLOCK" ]; then
  TOKEN="$($COMPOSE exec -T eam-meet-db psql -U eam_meet -d eam_meet -tAc \
            "SELECT value FROM \"SystemConfig\" WHERE key='SETUP_TOKEN'" 2>/dev/null | tr -d '[:space:]' || true)"
fi

# ── Done ────────────────────────────────────────────────────────────────────
printf '\n%s\n' "${GREEN}${B}════════════════  EZmeet is running  ════════════════${R}"
echo
if [ -n "$SETUP_BLOCK" ]; then
  printf '%s\n' "$SETUP_BLOCK"
elif [ -n "$TOKEN" ]; then
  echo "  1) Open:  ${B}$DOMAIN_FROM_ENV/setup${R}"
  echo "  2) Paste this one-time setup token:"
  echo
  echo "        ${B}$TOKEN${R}"
else
  echo "  Open ${B}$DOMAIN_FROM_ENV/setup${R} and paste the setup token from the logs:"
  echo "    cd $INSTALL_DIR && $COMPOSE logs eam-meet | grep -A3 SETUP"
fi
echo
echo "${DIM}TLS certificate is issued automatically on first HTTPS request — give it"
echo "a few seconds. Make sure these ports are open to the internet:${R}"
echo "    80/tcp 443/tcp 443/udp   3478/udp 7881/tcp 50000-50200/udp (WebRTC media)"
echo
echo "${DIM}Manage:${R}  cd $INSTALL_DIR"
echo "  logs:     $COMPOSE logs -f eam-meet"
echo "  restart:  $COMPOSE restart"
echo "  update:   curl -fsSL $REPO_URL/raw/$BRANCH/install.sh | sudo bash"
echo
