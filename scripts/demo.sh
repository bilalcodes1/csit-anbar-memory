#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p .wrangler/demo
export WRANGLER_SEND_METRICS=false
export WRANGLER_LOG_PATH="$PWD/.wrangler/demo"
port="${ARCHIVE_DEMO_PORT:-8790}"
state="$PWD/.wrangler/demo/state"
server_log="$PWD/.wrangler/demo/server.log"
password_file="$PWD/.wrangler/demo/password"
if [ ! -s "$password_file" ]; then openssl rand -hex 16 > "$password_file"; fi
token="$(openssl rand -hex 24)"
password="$(cat "$password_file")"

wrangler() {
  if [ -n "${WRANGLER_BIN:-}" ]; then "$WRANGLER_BIN" "$@"
  else npx --yes wrangler@4.160.0 "$@"; fi
}

sh scripts/build.sh
wrangler d1 migrations apply csit-anbar-memory --local --persist-to "$state"
if curl --silent --fail --max-time 2 "http://127.0.0.1:$port/" >/dev/null; then
  printf '%s\n' "Port $port is in use. Choose a different ARCHIVE_DEMO_PORT." >&2
  exit 1
fi
wrangler pages dev dist --ip 127.0.0.1 --port "$port" --persist-to "$state" \
  --binding "ADMIN_SETUP_TOKEN=$token" > "$server_log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
i=0
until curl --silent --fail --max-time 2 "http://127.0.0.1:$port/api/batches" >/dev/null; do
  if [ "$i" -ge 45 ] || ! kill -0 "$server" 2>/dev/null; then cat "$server_log" >&2; exit 1; fi
  i=$((i + 1))
  sleep 1
done
ARCHIVE_DEMO_URL="http://127.0.0.1:$port" ARCHIVE_DEMO_SETUP_TOKEN="$token" \
  ARCHIVE_DEMO_PASSWORD="$password" node scripts/demo-data.mjs
printf '\nالأرشيف  http://127.0.0.1:%s/\nالإدارة  http://127.0.0.1:%s/admin\nالمستخدم  demo_admin\nكلمة مرور العرض المحلي  %s\n\n' "$port" "$port" "$password"
wait "$server"
