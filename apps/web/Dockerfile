# Pin Node for runtime CVEs; bump intentionally when security releases ship.
FROM node:24.22.3-slim AS builder

WORKDIR /app

# Apply Debian security updates in the build stage too (curl/libcurl, zlib, etc.).
# Wiz often suggests `apk`; this image is Debian slim — use apt.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

COPY apps/web/package.json apps/web/package-lock.json* ./apps/web/
RUN cd apps/web && npm ci

COPY apps/web/ ./apps/web/
RUN cd apps/web && npm run build

FROM node:24.22.3-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/package-lock.json* ./apps/web/
RUN cd apps/web && npm ci --omit=dev

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

RUN groupadd -r appuser && useradd -r -g appuser -s /bin/false -d /app appuser \
 && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080
WORKDIR /app/apps/web
CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "8080"]
