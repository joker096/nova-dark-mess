# Relay-only image for a free always-on Node host (Northflank Sandbox, Oracle
# Cloud, or any Docker host). The client and Tauri build are not included.
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# The repo's prepare script installs local git hooks and is meaningless in an
# image; skip lifecycle scripts and install only runtime dependencies.
RUN npm ci --omit=dev --ignore-scripts

COPY server.js ./
COPY src/lib/anon ./src/lib/anon
COPY landing ./landing

RUN mkdir -p receipts /data
# Mount a persistent volume at /data on hosts that support one (Northflank,
# Docker). Without a volume the container still runs, but a recreated container
# starts with empty queues.
ENV ANON_STATE_DB_PATH=/data/anon-state.sqlite
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
