#!/usr/bin/env bash

stop_process_tree() {
  local pid="$1"
  if [[ -z "$pid" ]]; then return; fi
  if ! kill -0 "$pid" 2>/dev/null; then return; fi
  local children
  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  for child in $children; do
    stop_process_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

wait_for_first_exit() {
  local pids=("$@")
  while true; do
    for pid in "${pids[@]}"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        return
      fi
    done
    sleep 1
  done
}
