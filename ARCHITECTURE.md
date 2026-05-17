# Deployment Architecture

This application is deployed as three Cloud Run services fronted by Identity-Aware
Proxy (IAP). The shape is **non-negotiable** — every deployment MUST satisfy
every invariant in this document, or the application is not considered safe to
serve traffic.

```
          Internet (any Google user, gated by IAP + whitelist.txt)
                                │
                                ▼
                ┌──────────────────────────────┐
                │  Cloud Run: pdf-checker-proxy │  public, IAP enabled
                │  (Caddy reverse proxy)        │  --ingress=all
                └──────────────┬───────────────┘
                               │ Direct VPC Egress (default network)
                               ▼
            ┌──────────────────┴──────────────────┐
            │                                     │
┌───────────────────────────┐    ┌───────────────────────────────┐
│  Cloud Run: pdf-checker-web│    │  Cloud Run: pdf-checker-api   │
│  (Next.js frontend)       │    │  (Node.js / Express)           │
│  --ingress=internal       │    │  --ingress=internal            │
└───────────────────────────┘    └───────────────────────────────┘
   *.run.app → 403 public            *.run.app → 403 public
```

## Invariants

These are the rules the deployment exists to enforce. All five are required.

**a) Caddy is the reverse proxy.** The sole public entrypoint is the Caddy
Cloud Run service. Caddy forwards `/api/*` to the API service and everything
else to the web frontend. Source lives in `apps/proxy/`.

**b) Web and API are internal-only.** Both services are deployed with
`--ingress=internal`. Their `*.run.app` URLs reject public traffic with
HTTP 403. Caddy reaches them via Direct VPC Egress on the project's default
VPC with `--vpc-egress=all-traffic`, and Private Google Access is enabled on
the default subnet so the proxy's calls to `*.run.app` resolve to Google's
internal front-end and count as internal traffic.

**c) IAP gates Caddy and forces Google sign-in.** IAP is enabled directly on
the Caddy Cloud Run service. Any request that does not carry a valid IAP
session is redirected to Google OAuth. Because web and API reject public
traffic (invariant b), there is no path into the application that bypasses IAP.

**d) `whitelist.txt` controls who can sign in.** The file at the repo root is
the single source of truth. Each non-blank, non-comment line is an email
address granted `roles/iap.httpsResourceAccessor` on the Caddy service. Users
not listed cannot authenticate — Google sign-in succeeds, then IAP denies with
HTTP 403. `scripts/gcp_bootstrap.sh` syncs the file to IAP bindings, including
**removing** bindings for emails that have been deleted from the file.

**e) `scripts/gcp_bootstrap.sh` is the source of truth for networking.** The
script creates and configures every resource above. It is idempotent — every
step checks current state before changing it — so re-running it after editing
`whitelist.txt`, after deploying a new image, or after a partial failure is
always safe.

## DNS and TLS

Access is via the Google-assigned `*.run.app` URL for the Caddy service. TLS
is managed automatically by Cloud Run. **Custom DNS and a custom load balancer
are intentionally not set up.**

## IAP headers contract

Once a request clears IAP, Caddy receives and forwards:

- `X-Goog-Authenticated-User-Email: accounts.google.com:user@example.com`
- `X-Goog-Authenticated-User-Id: accounts.google.com:<numeric_id>`
- `X-Goog-IAP-JWT-Assertion: <signed JWT>`

`apps/api/src/lib/auth.ts` implements the trust path: strip the
`accounts.google.com:` prefix from `X-Goog-Authenticated-User-Email` and use
the result as the user identity. No JWT verification — the network-layer
invariants above (IAP on the proxy, `--ingress=internal` on the backends)
make the header trustworthy.

In `APP_ENV=local` or `APP_ENV=test` and the header is absent, it falls back
to `DEV_USER_EMAIL` so dev and tests work without a login screen.

**Never log either header's raw value at INFO level** — it leaks user identity
into shared log pipelines.

## Caddy configuration

The proxy is deployed from the public `docker.io/library/caddy:2-alpine`
image. The Caddyfile is stored as a Secret Manager secret
(`pdf-checker-proxy-caddyfile`) and mounted into the container at
`/etc/caddy/Caddyfile` at runtime.

## Bootstrap flow

1. `./scripts/gcp_bootstrap.sh --project tar-012f42959395` on first run creates:
   Artifact Registry repo, runtime service account, secrets, GCS bucket,
   default VPC (if missing), the web and api Cloud Run services as
   internal-only placeholders, the proxy Cloud Run service running the public
   `caddy:2-alpine` image with the Caddyfile mounted from Secret Manager and
   Direct VPC Egress configured, the IAP OAuth brand and client, IAP enabled
   on the proxy, and IAP IAM bindings synced from `whitelist.txt`.
2. Build and push images for `apps/web` and `apps/api` to Artifact Registry.
3. `gcloud run deploy` the real images to the web and api Cloud Run services.
4. Re-run `./scripts/gcp_bootstrap.sh` anytime you change `whitelist.txt`,
   edit `apps/proxy/Caddyfile`, or want to reassert the expected state.
