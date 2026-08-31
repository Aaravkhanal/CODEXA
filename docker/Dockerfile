# syntax=docker/dockerfile:1.7
# =============================================================================
# CODEXA — Multi-stage Dockerfile
#
# Stages:
#   deps    — install all workspace dependencies with Bun
#   dev     — development target (hot-reload server)
#   build   — compile release artifacts
#   server  — minimal production image for the API server
# =============================================================================

ARG BUN_VERSION=1.3.13

# -----------------------------------------------------------------------------
# Stage: deps — shared dependency installation layer
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS deps

WORKDIR /app

# Copy manifests first for better layer caching.
COPY package.json bun.lock ./
COPY packages/shared/package.json     packages/shared/package.json
COPY packages/database/package.json   packages/database/package.json
COPY packages/server/package.json     packages/server/package.json
COPY packages/cli/package.json        packages/cli/package.json
COPY packages/web/package.json        packages/web/package.json

RUN bun install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage: dev — development with hot reload
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS dev

WORKDIR /app

# Re-use installed node_modules from deps stage.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy source (will be overridden by a volume mount in compose.yml).
COPY . .

EXPOSE 3000

CMD ["bun", "run", "--hot", "packages/server/src/index.ts"]

# -----------------------------------------------------------------------------
# Stage: build — generate Prisma client and compile server
# -----------------------------------------------------------------------------
FROM deps AS build

COPY . .

RUN bun run --cwd packages/database db:generate
RUN bun run --cwd packages/server build

# -----------------------------------------------------------------------------
# Stage: server — slim production image
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS server

WORKDIR /app

# Copy only the compiled server and its dependencies.
COPY --from=build /app/node_modules       ./node_modules
COPY --from=build /app/packages           ./packages

# Runtime user: avoid running as root.
RUN addgroup -S codexa && adduser -S codexa -G codexa
USER codexa

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "packages/server/src/index.ts"]
