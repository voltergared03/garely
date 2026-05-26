#!/bin/sh
# EZmeet scheduler sidecar — materializes the crontab with CRON_SECRET from the
# container environment, then runs busybox crond in the foreground. Replaces the
# old "add these lines to your host crontab" step: scheduling now ships in-stack.
set -eu

: "${CRON_SECRET:?CRON_SECRET is required (set it in .env)}"
APP_URL="${CRON_TARGET_URL:-http://eam-meet:3000}"

mkdir -p /var/spool/cron/crontabs

# busybox crond does not reliably export the container env to jobs, so bake the
# secret + target into the crontab at startup. CRON_SECRET is hex (openssl
# rand -hex), safe to interpolate. Job output goes to the container log
# (PID 1, fd 1) so `docker compose logs cron` shows every run.
cat > /var/spool/cron/crontabs/root <<EOF
# min hour dom mon dow  command
*/5 * * * * wget -qO- -T 15 "${APP_URL}/api/cron/reminders?secret=${CRON_SECRET}"   >/proc/1/fd/1 2>&1
0 9 * * 1   wget -qO- -T 15 "${APP_URL}/api/cron/digest?secret=${CRON_SECRET}"      >/proc/1/fd/1 2>&1
0 3 * * *   wget -qO- -T 30 "${APP_URL}/api/cron/recordings?secret=${CRON_SECRET}"  >/proc/1/fd/1 2>&1
0 * * * *   wget -qO- -T 15 "${APP_URL}/api/cron/reg-cleanup?secret=${CRON_SECRET}" >/proc/1/fd/1 2>&1
EOF

echo "[cron] scheduler started — jobs target ${APP_URL}"
exec crond -f -d 8 -c /var/spool/cron/crontabs
