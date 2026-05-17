# Caddy Reverse Proxy

The sole public-facing Cloud Run service. Routes:

- `/api/*` → `pdf-checker-api` (internal)
- Everything else → `pdf-checker-web` (internal)

IAP is enabled on this service. See `ARCHITECTURE.md`.

The Caddyfile is stored as a Secret Manager secret and mounted at runtime.
To update routing, edit `Caddyfile` and re-run `scripts/gcp_bootstrap.sh`.
