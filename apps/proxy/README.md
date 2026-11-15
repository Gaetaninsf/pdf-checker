# Caddy Reverse Proxy

The sole public-facing Cloud Run service. Routes:

- `/api/*` → `pdf-checker-api` (internal)
- Everything else → `pdf-checker-web` (internal)

IAP is enabled on this service. See `ARCHITECTURE.md`.

The Caddyfile is stored as a Secret Manager secret and mounted at runtime.
To update routing, edit `Caddyfile` and re-run `scripts/gcp_bootstrap.sh`.

The Cloud Run image is built from `Dockerfile` (official `caddy` Alpine plus
`apk upgrade` for OS CVEs such as curl). Build/push with `make build` or Cloud
Build, then re-run bootstrap or `gcloud run deploy pdf-checker-proxy` with the
Artifact Registry image — do not change ingress/IAP flags.
