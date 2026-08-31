#!/usr/bin/env bash
# =============================================================================
# scripts/bootstrap.sh — CODEXA first-run developer setup
#
# This script automates the initial local environment setup:
#   1. Verifies Bun version
#   2. Installs workspace dependencies
#   3. Copies .env.example → .env (if .env is missing)
#   4. Starts a local PostgreSQL container (if Docker is available and no DB URL is set)
#   5. Generates Prisma client and applies schema
#   6. Prints a helpful summary with next steps
#
# Usage:
#   bash scripts/bootstrap.sh
# =============================================================================
set -euo pipefail

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

info()    { echo -e "${CYAN}[bootstrap]${RESET} $*"; }
success() { echo -e "${GREEN}[bootstrap]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[bootstrap]${RESET} $*"; }
error()   { echo -e "${RED}[bootstrap]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

REQUIRED_BUN="1.3.13"
POSTGRES_CONTAINER="codexa-postgres"

# --------------------------------------------------------------------------- #
# Step 1 — Bun version check
# --------------------------------------------------------------------------- #

header "Step 1/5 — Checking Bun version"

if ! command -v bun &>/dev/null; then
  error "Bun is not installed. Install it from https://bun.sh and re-run this script."
  exit 1
fi

INSTALLED_BUN="$(bun --version)"
if [[ "$INSTALLED_BUN" != "$REQUIRED_BUN" ]]; then
  warn "Bun $INSTALLED_BUN is installed, but CODEXA requires $REQUIRED_BUN."
  warn "Install the exact version with: curl -fsSL https://bun.sh/install | bash -s \"bun-v${REQUIRED_BUN}\""
  read -rp "Continue anyway? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
else
  success "Bun $INSTALLED_BUN ✓"
fi

# --------------------------------------------------------------------------- #
# Step 2 — Install workspace dependencies
# --------------------------------------------------------------------------- #

header "Step 2/5 — Installing dependencies"

bun install --frozen-lockfile
success "Dependencies installed ✓"

# --------------------------------------------------------------------------- #
# Step 3 — Environment file
# --------------------------------------------------------------------------- #

header "Step 3/5 — Environment configuration"

if [[ ! -f ".env" ]]; then
  cp .env.example .env
  info "Created .env from .env.example — fill in the required values before running the server."
else
  info ".env already exists — skipping copy."
fi

# Source .env so the rest of the script can see DATABASE_URL.
# shellcheck disable=SC1091
set -o allexport
source .env 2>/dev/null || true
set +o allexport

# --------------------------------------------------------------------------- #
# Step 4 — PostgreSQL setup
# --------------------------------------------------------------------------- #

header "Step 4/5 — Database setup"

if [[ -z "${DATABASE_URL:-}" ]]; then
  info "DATABASE_URL is not set."

  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    info "Docker is available — starting local PostgreSQL container…"

    if docker ps -a --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
      info "Container '${POSTGRES_CONTAINER}' already exists — starting it."
      docker start "${POSTGRES_CONTAINER}"
    else
      docker run \
        --name "${POSTGRES_CONTAINER}" \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=codexa \
        -p 5432:5432 \
        -d postgres:16-alpine
      info "Waiting for PostgreSQL to be ready…"
      sleep 3
    fi

    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/codexa"

    # Persist DATABASE_URL to .env if it's still empty there.
    if ! grep -q "^DATABASE_URL=" .env || grep -q "^DATABASE_URL=$" .env; then
      sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env && rm -f .env.bak
      success "Set DATABASE_URL in .env ✓"
    fi
  else
    warn "Docker is not available. Set DATABASE_URL in .env manually and re-run, or use docker/compose.yml."
    warn "  docker compose -f docker/compose.yml up -d postgres"
    exit 0
  fi
else
  info "DATABASE_URL is set — skipping container setup."
fi

# Apply schema
info "Generating Prisma client and pushing schema…"
bun run db:generate
bun run db:push
success "Database ready ✓"

# --------------------------------------------------------------------------- #
# Step 5 — Summary
# --------------------------------------------------------------------------- #

header "Step 5/5 — All done!"

echo ""
echo -e "  ${GREEN}✓${RESET} Dependencies installed"
echo -e "  ${GREEN}✓${RESET} .env configured"
echo -e "  ${GREEN}✓${RESET} Database ready"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo ""
echo "  Run the server:          bun run dev:server"
echo "  Run the CLI (dev):       bun run dev:cli"
echo "  Run the web landing:     bun run dev:web"
echo "  Run all quality checks:  bun run check"
echo ""
echo "  Or use Docker Compose:   docker compose -f docker/compose.yml up -d"
echo ""
echo -e "See ${CYAN}docs/DEVELOPMENT.md${RESET} for the full contributor guide."
echo ""
