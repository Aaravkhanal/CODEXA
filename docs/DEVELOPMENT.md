# Developing CODEXA

This guide describes a reproducible local environment for contributing to the
CODEXA monorepo. Documentation and landing-page changes do not require the API
services, but server and end-to-end work does.

## Prerequisites

- Git
- Bun 1.3.13
- PostgreSQL 15 or newer for server development
- Docker or another local PostgreSQL installation (optional, but convenient)

The required Bun version is also pinned in the root `package.json`. Install the
workspace exactly as locked:

```sh
bun install --frozen-lockfile
cp .env.example .env
```

Only populate the variables needed for the area you are changing. Never commit
`.env` or any real credential.

## Local PostgreSQL

If Docker is available, start an isolated development database:

```sh
docker run --name codexa-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=codexa \
  -p 5432:5432 \
  -d postgres:16-alpine
```

Set this value in `.env`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/codexa
```

Generate the Prisma client and apply the current schema:

```sh
bun run db:generate
bun run db:push
```

Later sessions can restart the same container with:

```sh
docker start codexa-postgres
```

## Service credentials

The landing page, shared package, and most CodexaLens tests need no external
credentials. Running the full local API requires:

- `DATABASE_URL` for PostgreSQL.
- Clerk server and OAuth values for authentication.
- Polar sandbox values for checkout, portal, and credit-meter behavior.
- At least one provider key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) for chat.

Sentry is optional in local development. Leave `SENTRY_DSN` empty to disable
reporting. CODEXA does not send default personally identifiable information.

Use sandbox or development projects only. The variable names and safe defaults
are listed in `.env.example`.

## Running packages

Run each process in its own terminal:

```sh
bun run dev:server
bun run dev:cli
bun run dev:web
```

The API listens on port 3000 and the Vite development server normally listens
on port 5173. Set `API_URL=http://localhost:3000` when the CLI should use the
local API instead of the hosted service.

## Quality checks

Run the same core quality gate used by contributors and CI:

```sh
bun run check
```

Individual commands are available when iterating:

```sh
bun run lint
bun run typecheck
bun test
bun run build:web
```

After staging files, format only the intended contribution with:

```sh
bun run format
```

For release and installer changes, follow `docs/RELEASING.md` and run the relevant platform smoke tests.

---

## Docker Compose Developer Workflow

If you prefer to run services containerized rather than setting up local PostgreSQL and Hono environments on your bare metal, a fully pre-configured Docker Compose environment is provided under `docker/`.

### 1. Startup Services
Make sure Docker is running on your machine, then run:
```sh
docker compose -f docker/compose.yml up -d
```
This spins up:
- **`postgres`**: Exposes port `5432` on localhost.
- **`server`**: A hot-reload Node/Bun container exposing the Hono API on port `3000`.

### 2. Check Service Logs
To inspect outputs and watch server logs during startup or tool execution:
```sh
docker compose -f docker/compose.yml logs -f server
```

### 3. Teardown
To shut down and wipe database volumes:
```sh
docker compose -f docker/compose.yml down -v
```

---

## Contributor Flow Step-by-Step

Follow these steps to submit clean contributions:

1. **Fork & Branch**: Create a feature branch from the latest `main` branch.
   ```sh
   git checkout -b feat/your-feature-name
   ```
2. **Environment Bootstrap**: Run the bootstrap helper script to verify your setup, copy template configuration files, and install workspace dependencies:
   ```sh
   bash scripts/bootstrap.sh
   ```
3. **Database Changes**: If you are adding or changing database columns, modify `packages/database/prisma/schema.prisma`, then run:
   ```sh
   bun run db:generate
   bun run db:push
   ```
4. **Develop**: Write your code. Use `bun run dev:server`, `bun run dev:cli`, or `bun run dev:web` to interactively run the parts of the stack you're changing.
5. **Quality Verification**:
   Ensure `bun run check` succeeds locally before committing code. Fix any Biome lint issues using `bun run format`.
6. **Pull Request**: Open a scoped PR. Ensure you fill out the details in the pull request template.

---

## Windows-Specific Setup Notes

### 1. WSL2 Recommended
Developing inside **WSL2 (Windows Subsystem for Linux)** with an Ubuntu distribution is strongly recommended, as it ensures shell scripts (`.sh`) run natively, and permissions match Linux/macOS.

### 2. Native Windows Caveats
If developing directly on Windows without WSL:
- Run PowerShell 7+ as an Administrator.
- Make sure git doesn't silently alter file endings (CRLF vs LF) on shell scripts:
  ```powershell
  git config --global core.autocrlf input
  ```
- Use path methods (`path.join` and `path.resolve`) to avoid hardcoded `/` which can cause failures on Windows platforms.

---

## Troubleshooting Setup Errors

### 1. `Prisma Client not generated`
If you receive a module resolution error for `@prisma/client` inside any of the workspaces, re-run:
```sh
bun run db:generate
```

### 2. `Invalid Port / Connection Refused`
If the CLI client cannot connect to your API server:
- Confirm `bun run dev:server` is running and listening on port `3000`.
- Verify `API_URL` environment variable is set to `http://localhost:3000` (or `http://127.0.0.1:3000`) in your local `.env` file.

