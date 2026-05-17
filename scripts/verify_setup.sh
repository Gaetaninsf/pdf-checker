#!/usr/bin/env bash
set -euo pipefail

ok=true

check() {
  local name="$1" cmd="$2" want="$3"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "MISSING  $name ($cmd not found)"
    ok=false
    return
  fi
  echo "OK       $name ($cmd found)"
}

check "Node.js"  node  "22+"
check "npm"      npm   ""
check "git"      git   ""

if ! $ok; then
  echo ""
  echo "Some tools are missing. Install them before continuing."
  exit 1
fi

echo ""
echo "All required tools found."
