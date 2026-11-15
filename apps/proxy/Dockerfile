# Thin wrapper around official Caddy Alpine so we can apply OS package
# security upgrades (e.g. CVE-2026-9079 in curl) without changing routing.
# Pin the Caddy minor so rebuilds stay reproducible; bump intentionally.
FROM caddy:2.11.9-alpine

USER root
RUN apk update \
 && apk upgrade --no-cache \
 && rm -rf /var/cache/apk/*

# Official image uses numeric non-root UID 1000 (no named "caddy" passwd entry
# in some tags). Restore that after apk upgrades.
USER 1000
