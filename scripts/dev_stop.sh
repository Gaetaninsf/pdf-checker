#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.run/dev"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/process_helpers.sh"

for pidfile in "$PID_DIR"/*.pid; do
  [[ -f "$pidfile" ]] || continue
  pid="$(tr -d '[:space:]' < "$pidfile")"
  if [[ -n "$pid" ]]; then
    stop_process_tree "$pid"
    echo "Stopped pid $pid ($(basename "$pidfile" .pid))"
  fi
  rm -f "$pidfile"
done

rmdir "$PID_DIR" 2>/dev/null || true
echo "Dev processes stopped."
