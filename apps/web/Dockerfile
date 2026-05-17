FROM node:24-slim AS builder

WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json* ./apps/web/
RUN cd apps/web && npm ci

COPY apps/web/ ./apps/web/
RUN cd apps/web && npm run build

FROM node:24-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

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
