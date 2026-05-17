#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.run/dev"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/process_helpers.sh"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

export APP_ENV="${APP_ENV:-local}"
export DEV_USER_EMAIL="${DEV_USER_EMAIL:-dev.user@example.com}"

mkdir -p "$PID_DIR"

if [[ -f "$PID_DIR/api.pid" || -f "$PID_DIR/web.pid" ]]; then
  echo "Detected existing dev pid files. Attempting cleanup first..."
  "$ROOT_DIR/scripts/dev_stop.sh" >/dev/null 2>&1 || true
  mkdir -p "$PID_DIR"
fi

echo "Starting API on http://127.0.0.1:8001 ..."
(
  cd apps/api
  exec npx tsx src/server.ts
) &
API_PID=$!
printf '%s\n' "$API_PID" > "$PID_DIR/api.pid"

echo "Starting web on http://127.0.0.1:3000 ..."
(
  cd apps/web
  exec npx next dev --hostname 127.0.0.1 --port 3000
) &
WEB_PID=$!
printf '%s\n' "$WEB_PID" > "$PID_DIR/web.pid"

cleanup() {
  echo "Stopping dev processes..."
  stop_process_tree "$WEB_PID"
  stop_process_tree "$API_PID"
  rm -f "$PID_DIR/api.pid" "$PID_DIR/web.pid"
  rmdir "$PID_DIR" 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo ""
echo "Local services:"
echo "  - Web: http://127.0.0.1:3000"
echo "  - API: http://127.0.0.1:8001"
echo "  - Health: http://127.0.0.1:8001/api/healthz"
echo "  - Stop later if needed: make dev_stop"

wait_for_first_exit "$API_PID" "$WEB_PID"
