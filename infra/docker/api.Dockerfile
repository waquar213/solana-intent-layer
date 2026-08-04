# Multi-stage build for services/api (ADR-0021 §Docker standards).
# Non-root, slim runtime, production-only deps. Built from the repo root:
#   docker build -f infra/docker/api.Dockerfile -t intent-wallet/api .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# --- deps: install with a cached, frozen lockfile ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY services ./services
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- build: compile the workspace, then prune to prod deps ---
FROM deps AS build
COPY tsconfig.base.json ./
RUN pnpm -r build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @intent-wallet/api deploy --prod /app

# --- runtime: minimal, non-root ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
# Drop privileges: the node image ships an unprivileged `node` user.
USER node
EXPOSE 8080
# Liveness is /healthz; readiness is /readyz (services/api/src/routes/health.ts).
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
