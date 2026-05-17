FROM node:24-slim AS builder

WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json* ./apps/api/
RUN cd apps/api && npm ci

COPY apps/api/ ./apps/api/
RUN cd apps/api && npx tsc

FROM node:24-slim

ENV NODE_ENV=production \
    APP_ENV=prod \
    APP_HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/package-lock.json* ./apps/api/
RUN cd apps/api && npm ci --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist

RUN groupadd -r appuser && useradd -r -g appuser -s /bin/false -d /app appuser \
 && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
