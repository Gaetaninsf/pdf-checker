# Project Memory For Claude Code

## CRITICAL — Deployment Security (Non-Negotiable)

Read this section before proposing ANY change to deploy config, networking,
IAM, auth flows, the Caddy proxy, or the bootstrap script. These rules exist
to keep the production deployment behind Identity-Aware Proxy (IAP). Weakening
any of them is a security incident.

### The mandatory deploy shape

The deployed app is three Cloud Run services (see `ARCHITECTURE.md`):

1. `pdf-checker-proxy` — Caddy reverse proxy. The **only** public entrypoint.
   `--ingress=all`, IAP enabled, Direct VPC Egress on the default VPC.
2. `pdf-checker-web` — Next.js frontend. `--ingress=internal`.
3. `pdf-checker-api` — Node.js/Express API. `--ingress=internal`.

External traffic reaches web/api ONLY via Caddy. Web and api `*.run.app` URLs
return HTTP 403 for the public internet.

### Cloud Run services without IAP must be internal-only

A Cloud Run service is either IAP-gated (proxy-shape, `--ingress=all` with
IAP enforcing auth) or strictly internal (`--ingress=internal`). There is no
third option. **Never use `--ingress=internal-and-cloud-load-balancing` on
any service in this project, ever.** Never `--ingress=all` on a non-IAP
service.

### Private Google Access is load-bearing

The proxy uses `--vpc-egress=all-traffic` and the backend services use
`--ingress=internal`. Private Google Access on the region's default subnet
makes the routing work. Without it, the proxy gets 502s.

### The whitelist is authoritative

`whitelist.txt` at the repo root is the single source of truth for who can
access the deployed app.

### The bootstrap script is idempotent

`scripts/gcp_bootstrap.sh` is the only supported way to provision and update
the deployment.

### Cloud Run invoker IAM

- **Proxy:** no `allUsers` binding. IAP is the sole authenticator.
- **Web and API:** deployed with `--allow-unauthenticated` (defense-in-depth
  gap accepted; `--ingress=internal` is the primary control).

### Forbidden changes (refuse if asked)

- Changing web/api ingress from `internal` to `all` or
  `internal-and-cloud-load-balancing`.
- Using `--ingress=internal-and-cloud-load-balancing` on ANY service.
- Granting `allUsers` `roles/run.invoker` on the proxy.
- Disabling IAP on the Caddy service.
- Deploying the web or API service as a second public entrypoint.
- Granting IAP access to users outside of `whitelist.txt`.
- Removing Direct VPC Egress from the Caddy service.
- Disabling Private Google Access on the default subnet.
- Skipping the bootstrap script or duplicating its logic.

### Trusting IAP headers in application code

After IAP clears a request, Caddy forwards:

- `X-Goog-Authenticated-User-Email: accounts.google.com:<email>`

In the deployed environment this is the authoritative user identity.
Application code strips the `accounts.google.com:` prefix and trusts the
result. In `APP_ENV=local` / `APP_ENV=test` the middleware falls back to
`DEV_USER_EMAIL`. **Never log the raw values at INFO level.**

---

## Architecture Summary

- Monorepo with a Node.js/Express API in `apps/api` and a Next.js Pages Router
  web app in `apps/web`.
- No database — the app reads from the Box API only.
- Auth: IAP-inserted `X-Goog-Authenticated-User-Email` header is the sole
  identity source. Local/test falls back to `DEV_USER_EMAIL`.
- Secrets: Box API credentials are stored in GCP Secret Manager and injected
  as env vars at Cloud Run deploy time.

## Golden Commands

- Setup: `make setup`
- Local dev: `make dev`
- Tests: `make test`
- Lint: `make lint`
- Typecheck: `make typecheck`
- Security checks: `make security`

## Definition Of Done

Before marking a task complete, all of these must pass:

- `make test`
- `make lint`
- `make typecheck`
- `make security`

## Non-Negotiable Rules

- Never weaken the IAP deploy shape — see "CRITICAL — Deployment Security" above.
- Never add auth bypass paths outside `APP_ENV=local` or `APP_ENV=test`.
- Never log secrets, bearer tokens, or private key material.
- Never log raw `X-Goog-Authenticated-User-Email` values.
- Never commit Box API credentials to the repository.

## GCP Project

- Project ID: `tar-012f42959395`
- Project Number: `134954051775`
- Region: `us-central1`
