#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="$ROOT_DIR/APP_MANIFEST.yaml"

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "Project not set. Pass project id as first arg or set gcloud default project." >&2
  exit 1
fi

parse_manifest() {
  local key="$1"
  python3 - "$MANIFEST_PATH" "$key" <<'PY'
import re
import sys

manifest_path = sys.argv[1]
needle = sys.argv[2]
text = open(manifest_path, "r", encoding="utf-8").read()
pattern = re.compile(rf"^\s*{re.escape(needle)}:\s*\"?([^\n\"]+)\"?\s*$", re.MULTILINE)
match = pattern.search(text)
if match:
    print(match.group(1).strip())
PY
}

APP_SLUG="$(parse_manifest "slug")"
REGION="$(parse_manifest "region")"
BUCKET_NAME="$(parse_manifest "gcs_bucket")"

APP_SLUG="${APP_SLUG:-pdf-checker}"
REGION="${REGION:-us-central1}"

echo "PROJECT_ID=${PROJECT_ID}"
echo "REGION=${REGION}"
echo "GCS_BUCKET=${BUCKET_NAME:-AUTO}"
echo ""
echo "Secrets:"
echo "  ${APP_SLUG}-box-client-id"
echo "  ${APP_SLUG}-box-client-secret"
echo "  ${APP_SLUG}-box-enterprise-id"
echo "  ${APP_SLUG}-box-folder-id"
echo "  ${APP_SLUG}-proxy-caddyfile"
