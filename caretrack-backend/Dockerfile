# CareTrack API — production image
# Node 20 LTS (the app requires >=20.19; Node 18 is not supported).
FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies against the lockfile for reproducible builds.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Final runtime image.
FROM base AS runtime
# Run as the unprivileged user that ships with the node image.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations
RUN mkdir -p /app/logs && chown node:node /app/logs

USER node

# App Service injects PORT (commonly 8080); the app falls back to 3001 locally.
ENV PORT=8080
EXPOSE 8080

# Container-level liveness probe against the health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
