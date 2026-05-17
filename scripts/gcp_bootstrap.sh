#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="$ROOT_DIR/APP_MANIFEST.yaml"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required. Install Google Cloud SDK first." >&2
  exit 1
fi

# --- Preflight: ensure gcloud beta is installed ---
if ! gcloud components list --filter="id=beta" --format="value(state.name)" 2>/dev/null | grep -q Installed; then
  echo "Installing required gcloud beta component..."
  gcloud components install beta --quiet
fi

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  echo "No active gcloud account found. Run: gcloud auth login" >&2
  exit 1
fi

PROJECT_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [[ -z "$PROJECT_ID" ]]; then
  echo "No GCP project selected. Use --project or run: gcloud config set project <PROJECT_ID>" >&2
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
ARTIFACT_REPO="$(parse_manifest "artifact_registry_repo")"
BUCKET_FROM_MANIFEST="$(parse_manifest "gcs_bucket")"

APP_SLUG="${APP_SLUG:-pdf-checker}"
REGION="${REGION:-us-central1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-apps}"
BUCKET_FROM_MANIFEST="${BUCKET_FROM_MANIFEST:-AUTO}"

RUN_SA_NAME="${APP_SLUG}-run-sa"
RUN_SA_EMAIL="${RUN_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

ensure_api_enabled() {
  local api="$1"
  if gcloud services list --enabled --project "$PROJECT_ID" --filter="config.name:${api}" --format='value(config.name)' | grep -q "$api"; then
    echo "[skip] API already enabled: $api"
  else
    echo "[create] Enabling API: $api"
    gcloud services enable "$api" --project "$PROJECT_ID" >/dev/null
  fi
}

ensure_empty_secret() {
  local secret_name="$1"
  if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "[skip] Secret exists: $secret_name"
  else
    echo "[create] Empty secret placeholder: $secret_name"
    printf "" | gcloud secrets create "$secret_name" \
      --project "$PROJECT_ID" \
      --replication-policy="user-managed" \
      --locations="$REGION" \
      --data-file=- >/dev/null
  fi
}

echo "Using project: $PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null

for api in \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  iam.googleapis.com \
  iap.googleapis.com \
  compute.googleapis.com
do
  ensure_api_enabled "$api"
done

if gcloud artifacts repositories describe "$ARTIFACT_REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Artifact Registry repo exists: $ARTIFACT_REPO"
else
  echo "[create] Artifact Registry repo: $ARTIFACT_REPO"
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --repository-format=docker >/dev/null
fi

if gcloud iam service-accounts describe "$RUN_SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Service account exists: $RUN_SA_EMAIL"
else
  echo "[create] Service account: $RUN_SA_EMAIL"
  gcloud iam service-accounts create "$RUN_SA_NAME" \
    --project "$PROJECT_ID" \
    --display-name "${APP_SLUG} Cloud Run Runtime SA" >/dev/null
fi

# --- Box API secrets (empty placeholders — fill via Console or gcloud) ---
for secret in \
  "${APP_SLUG}-box-client-id" \
  "${APP_SLUG}-box-client-secret" \
  "${APP_SLUG}-box-enterprise-id" \
  "${APP_SLUG}-box-folder-id"
do
  ensure_empty_secret "$secret"
done

# --- Grant SA access to secrets ---
for secret in \
  "${APP_SLUG}-box-client-id" \
  "${APP_SLUG}-box-client-secret" \
  "${APP_SLUG}-box-enterprise-id" \
  "${APP_SLUG}-box-folder-id"
do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project "$PROJECT_ID" \
    --member "serviceAccount:${RUN_SA_EMAIL}" \
    --role "roles/secretmanager.secretAccessor" >/dev/null
done

# --- GCS bucket (scaffold convention) ---
if [[ "$BUCKET_FROM_MANIFEST" == "AUTO" ]]; then
  BUCKET_NAME="${PROJECT_ID}-${APP_SLUG}"
  BUCKET_NAME="$(echo "$BUCKET_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
else
  BUCKET_NAME="$BUCKET_FROM_MANIFEST"
fi

if gcloud storage buckets describe "gs://${BUCKET_NAME}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Bucket exists: gs://${BUCKET_NAME}"
else
  echo "[create] Bucket: gs://${BUCKET_NAME}"
  gcloud storage buckets create "gs://${BUCKET_NAME}" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention >/dev/null
fi

gcloud storage buckets update "gs://${BUCKET_NAME}" \
  --project "$PROJECT_ID" \
  --uniform-bucket-level-access \
  --public-access-prevention >/dev/null

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
  --member "serviceAccount:${RUN_SA_EMAIL}" \
  --role "roles/storage.objectAdmin" >/dev/null

# ============================================================================
# Networking: Caddy proxy + IAP + internal-only web/api.
# See ARCHITECTURE.md. Idempotent — re-run to reassert the expected state.
# ============================================================================

PROXY_SERVICE="${APP_SLUG}-proxy"
WEB_SERVICE="${APP_SLUG}-web"
API_SERVICE="${APP_SLUG}-api"
CADDYFILE_PATH="${ROOT_DIR}/apps/proxy/Caddyfile"
CADDYFILE_SECRET="${APP_SLUG}-proxy-caddyfile"
WHITELIST_FILE="${ROOT_DIR}/whitelist.txt"
CADDY_IMAGE="docker.io/library/caddy:2-alpine"
PLACEHOLDER_IMAGE="us-docker.pkg.dev/cloudrun/container/hello"

run_service_exists() {
  gcloud run services describe "$1" \
    --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1
}

run_service_field() {
  gcloud run services describe "$1" \
    --project "$PROJECT_ID" --region "$REGION" \
    --format="value($2)" 2>/dev/null || true
}

# --- Default VPC (required for Caddy Direct VPC Egress) ---
if gcloud compute networks describe default --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Default VPC network exists"
else
  echo "[create] Default VPC network"
  gcloud compute networks create default \
    --project "$PROJECT_ID" \
    --subnet-mode=auto >/dev/null
fi

# --- Private Google Access on the default subnet (region-scoped) ---
PGA_CURRENT="$(gcloud compute networks subnets describe default \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(privateIpGoogleAccess)' 2>/dev/null || true)"
if [[ "$PGA_CURRENT" == "True" ]]; then
  echo "[skip] Private Google Access already enabled on default/$REGION"
else
  echo "[update] Enabling Private Google Access on default/$REGION"
  gcloud compute networks subnets update default \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --enable-private-ip-google-access >/dev/null
fi

# --- Caddyfile secret (synced from apps/proxy/Caddyfile) ---
if [[ ! -f "$CADDYFILE_PATH" ]]; then
  echo "Missing $CADDYFILE_PATH — cannot provision proxy." >&2
  exit 1
fi

if gcloud secrets describe "$CADDYFILE_SECRET" --project "$PROJECT_ID" >/dev/null 2>&1; then
  CURRENT_CADDYFILE="$(gcloud secrets versions access latest \
    --secret "$CADDYFILE_SECRET" --project "$PROJECT_ID" 2>/dev/null || true)"
  LOCAL_CADDYFILE="$(cat "$CADDYFILE_PATH")"
  if [[ "$CURRENT_CADDYFILE" == "$LOCAL_CADDYFILE" ]]; then
    echo "[skip] Secret $CADDYFILE_SECRET up to date"
  else
    echo "[update] Secret $CADDYFILE_SECRET <- apps/proxy/Caddyfile"
    gcloud secrets versions add "$CADDYFILE_SECRET" \
      --project "$PROJECT_ID" \
      --data-file="$CADDYFILE_PATH" >/dev/null
  fi
else
  echo "[create] Secret $CADDYFILE_SECRET <- apps/proxy/Caddyfile"
  gcloud secrets create "$CADDYFILE_SECRET" \
    --project "$PROJECT_ID" \
    --replication-policy="user-managed" \
    --locations="$REGION" \
    --data-file="$CADDYFILE_PATH" >/dev/null
fi

gcloud secrets add-iam-policy-binding "$CADDYFILE_SECRET" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${RUN_SA_EMAIL}" \
  --role "roles/secretmanager.secretAccessor" >/dev/null

# --- Web and API Cloud Run services (internal-only ingress) ---
for SVC in "$WEB_SERVICE" "$API_SERVICE"; do
  if run_service_exists "$SVC"; then
    CURRENT_INGRESS="$(run_service_field "$SVC" 'metadata.annotations.run\.googleapis\.com/ingress')"
    if [[ "$CURRENT_INGRESS" == "internal" ]]; then
      echo "[ok] $SVC ingress=internal"
    else
      echo "[update] $SVC ingress -> internal"
      gcloud run services update "$SVC" \
        --project "$PROJECT_ID" --region "$REGION" \
        --ingress=internal >/dev/null
    fi
  else
    echo "[create] Cloud Run placeholder: $SVC (ingress=internal)"
    gcloud run deploy "$SVC" \
      --project "$PROJECT_ID" --region "$REGION" \
      --image "$PLACEHOLDER_IMAGE" \
      --platform managed \
      --allow-unauthenticated \
      --ingress=internal \
      --quiet >/dev/null
  fi
done

WEB_URL="$(run_service_field "$WEB_SERVICE" 'status.url')"
API_URL="$(run_service_field "$API_SERVICE" 'status.url')"
if [[ -z "$WEB_URL" || -z "$API_URL" ]]; then
  echo "Could not resolve upstream URLs (web=$WEB_URL, api=$API_URL). Aborting." >&2
  exit 1
fi

# --- Caddy proxy Cloud Run service (public, IAP will gate it) ---
PROXY_COMMON_ARGS=(
  --project "$PROJECT_ID"
  --region "$REGION"
  --image "$CADDY_IMAGE"
  --service-account "$RUN_SA_EMAIL"
  --no-allow-unauthenticated
  --ingress=all
  --network=default
  --subnet=default
  --vpc-egress=all-traffic
  --set-env-vars "API_UPSTREAM=${API_URL},WEB_UPSTREAM=${WEB_URL}"
  --update-secrets "/etc/caddy/Caddyfile=${CADDYFILE_SECRET}:latest"
  --quiet
)

if run_service_exists "$PROXY_SERVICE"; then
  echo "[update] $PROXY_SERVICE (image, Caddyfile, upstreams, VPC egress, ingress)"
else
  echo "[create] Cloud Run: $PROXY_SERVICE (public caddy:2-alpine)"
fi
gcloud run deploy "$PROXY_SERVICE" "${PROXY_COMMON_ARGS[@]}" >/dev/null

# --- Strip any stray allUsers invoker binding on the proxy (idempotent) ---
echo "[update] Ensuring no allUsers invoker binding on $PROXY_SERVICE"
gcloud run services remove-iam-policy-binding "$PROXY_SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" \
  --member="allUsers" \
  --role="roles/run.invoker" >/dev/null 2>&1 || true

# --- IAP: OAuth consent brand ---
EXISTING_BRAND="$(gcloud iap oauth-brands list --project "$PROJECT_ID" --format='value(name)' 2>/dev/null | head -1 || true)"
if [[ -z "$EXISTING_BRAND" ]]; then
  echo "[create] IAP OAuth consent brand"
  if ! gcloud iap oauth-brands create \
      --application_title="$APP_SLUG" \
      --support_email="$ACTIVE_ACCOUNT" \
      --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "[warn] Could not create OAuth brand automatically." >&2
    echo "       Create it in the Cloud Console (APIs & Services > OAuth consent screen)" >&2
    echo "       and re-run this script to finish IAP setup." >&2
    exit 1
  fi
  EXISTING_BRAND="$(gcloud iap oauth-brands list --project "$PROJECT_ID" --format='value(name)' 2>/dev/null | head -1)"
else
  echo "[skip] IAP OAuth consent brand exists"
fi

# --- IAP: OAuth client under the brand ---
EXISTING_CLIENT="$(gcloud iap oauth-clients list "$EXISTING_BRAND" --project "$PROJECT_ID" --format='value(name)' 2>/dev/null | head -1 || true)"
if [[ -z "$EXISTING_CLIENT" ]]; then
  echo "[create] IAP OAuth client under brand"
  gcloud iap oauth-clients create "$EXISTING_BRAND" \
    --display_name="IAP-${APP_SLUG}" \
    --project "$PROJECT_ID" >/dev/null
else
  echo "[skip] IAP OAuth client exists"
fi

# --- IAP: enable on the Caddy proxy (idempotent) ---
echo "[update] Enabling IAP on $PROXY_SERVICE (Cloud Run)"
gcloud beta run services update "$PROXY_SERVICE" \
  --iap \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --quiet >/dev/null

# --- IAP: sync whitelist.txt -> IAM bindings on the proxy ---
if [[ ! -f "$WHITELIST_FILE" ]]; then
  echo "[warn] whitelist.txt not found at $WHITELIST_FILE — skipping IAP access sync" >&2
else
  echo "[iap] Syncing $(basename "$WHITELIST_FILE") -> $PROXY_SERVICE"

  DESIRED_EMAILS="$(awk '
    {
      sub(/#.*/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      if (length > 0 && !seen[$0]++) print
    }
  ' "$WHITELIST_FILE")"

  CURRENT_EMAILS="$(gcloud iap web get-iam-policy \
      --resource-type=cloud-run \
      --service="$PROXY_SERVICE" \
      --region="$REGION" \
      --project "$PROJECT_ID" \
      --flatten="bindings[].members[]" \
      --filter="bindings.role=roles/iap.httpsResourceAccessor" \
      --format="value(bindings.members)" 2>/dev/null \
    | sed -n 's/^user://p' \
    | sort -u \
    || true)"

  while IFS= read -r email; do
    [[ -z "$email" ]] && continue
    if ! printf '%s\n' "$CURRENT_EMAILS" | grep -qxF "$email"; then
      echo "  [iap:add]    $email"
      gcloud iap web add-iam-policy-binding \
        --resource-type=cloud-run \
        --service="$PROXY_SERVICE" \
        --region="$REGION" \
        --project "$PROJECT_ID" \
        --member="user:$email" \
        --role="roles/iap.httpsResourceAccessor" >/dev/null
    fi
  done <<< "$DESIRED_EMAILS"

  while IFS= read -r email; do
    [[ -z "$email" ]] && continue
    if ! printf '%s\n' "$DESIRED_EMAILS" | grep -qxF "$email"; then
      echo "  [iap:remove] $email (removed from whitelist.txt)"
      gcloud iap web remove-iam-policy-binding \
        --resource-type=cloud-run \
        --service="$PROXY_SERVICE" \
        --region="$REGION" \
        --project "$PROJECT_ID" \
        --member="user:$email" \
        --role="roles/iap.httpsResourceAccessor" >/dev/null
    fi
  done <<< "$CURRENT_EMAILS"
fi

PROXY_URL="$(run_service_field "$PROXY_SERVICE" 'status.url')"

echo ""
echo "Bootstrap complete."
echo ""
echo "Public entrypoint (IAP-gated):"
echo "  ${PROXY_URL:-<run \`gcloud run services describe ${PROXY_SERVICE}\` to see the URL>}"
echo ""
echo "Internal Cloud Run services (not publicly reachable):"
echo "  ${WEB_SERVICE}  ${WEB_URL}"
echo "  ${API_SERVICE}  ${API_URL}"
echo ""
echo "Deploy templates for the internal services (replace the placeholder image):"
echo ""
echo "gcloud run deploy ${WEB_SERVICE} \\"
echo "  --project ${PROJECT_ID} \\"
echo "  --region ${REGION} \\"
echo "  --service-account ${RUN_SA_EMAIL} \\"
echo "  --set-env-vars APP_ENV=prod \\"
echo "  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${APP_SLUG}-web:latest"
echo ""
echo "gcloud run deploy ${API_SERVICE} \\"
echo "  --project ${PROJECT_ID} \\"
echo "  --region ${REGION} \\"
echo "  --service-account ${RUN_SA_EMAIL} \\"
echo "  --set-secrets BOX_CLIENT_ID=${APP_SLUG}-box-client-id:latest,BOX_CLIENT_SECRET=${APP_SLUG}-box-client-secret:latest,BOX_ENTERPRISE_ID=${APP_SLUG}-box-enterprise-id:latest,BOX_FOLDER_ID=${APP_SLUG}-box-folder-id:latest \\"
echo "  --set-env-vars APP_ENV=prod \\"
echo "  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${APP_SLUG}-api:latest"
echo ""
echo "  Do NOT pass --ingress or --clear-vpc-connector on redeploys — ingress"
echo "  and VPC settings are owned by this bootstrap script."
echo ""
echo "Secrets (fill via Console or gcloud secrets versions add):"
echo "  ${APP_SLUG}-box-client-id"
echo "  ${APP_SLUG}-box-client-secret"
echo "  ${APP_SLUG}-box-enterprise-id"
echo "  ${APP_SLUG}-box-folder-id"
echo "  ${CADDYFILE_SECRET} (synced from apps/proxy/Caddyfile)"
echo ""
echo "Success checklist:"
echo "  [ ] Fill Box API secrets in Secret Manager"
echo "  [ ] Build and push real images for ${APP_SLUG}-web and ${APP_SLUG}-api to Artifact Registry"
echo "  [ ] Deploy them with the templates above (placeholders will be replaced)"
echo "  [ ] Visit the proxy URL, sign in with a whitelisted Google account"
echo "  [ ] Confirm ${PROXY_URL}/api/healthz returns {\"ok\": true}"
echo "  [ ] Confirm the bare *.run.app URLs of ${WEB_SERVICE} and ${API_SERVICE} return 403"
