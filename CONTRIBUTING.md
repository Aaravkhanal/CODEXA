# Contributing to CODEXA

Thanks for wanting to improve CODEXA. This project touches a terminal UI, API
server, database layer, release tooling, and landing page, so the best
contributions are focused, verified, and easy to review.

## Getting Started

Read the [development guide](./docs/DEVELOPMENT.md) for the complete environment,
database, authentication, and billing setup. The shortest path for documentation,
shared-library, and landing-page work is:

1. Fork the repository and create a feature branch from `main`.
2. Install Bun 1.3.13, then install dependencies:

   ```sh
   bun install --frozen-lockfile
   ```

3. Run the part of the project you are changing:

   ```sh
   bun run dev:server
   bun run dev:cli
   bun run dev:web
   ```

4. Keep changes scoped to the issue or improvement you are working on.

## Project Structure

| Path | Area |
| --- | --- |
| `packages/cli` | Terminal UI, command menu, themes, session screens |
| `packages/server` | API routes, auth, chat, billing, MCP runtime, CodexaLens |
| `packages/shared` | Shared schemas and cross-package types |
| `packages/database` | Prisma schema and generated client setup |
| `packages/web` | Landing page |
| `scripts` | Release and distribution automation |

## Development Checks

Before opening a pull request, run the checks that match your change:

```sh
bun test
bun run build:web
bun run check
```

For CLI or release changes, also run the relevant release smoke checks against a
built release binary when possible:

```sh
version="$(bun -e 'console.log(require("./packages/cli/package.json").version)')"
bun run release:smoke -- ./path/to/codexa "$version"
```

If you cannot run a check locally, mention that in the pull request and explain
why.

## Pull Request Guidelines

- Use a clear title that describes the behavior change.
- Keep pull requests small enough to review in one pass.
- Include screenshots or terminal output for UI changes.
- Add or update tests when behavior changes.
- Avoid committing generated, temporary, local cache, or machine-specific files.
- Do not include secrets, tokens, database URLs, API keys, or private credentials.

## Commit Style

Use short, action-oriented commit messages:

```text
fix: handle missing prisma database url during generate
feat: add codexalens file activity summary
docs: expand install instructions
```

## Environment Variables

Local development may need environment variables depending on the package being
run. Copy `.env.example` to `.env`, fill only the values needed for your work,
and never commit the resulting file.

Common variables include:

| Variable | Used By |
| --- | --- |
| `API_URL` | CLI API override |
| `DATABASE_URL` | Server/database runtime |
| `ANTHROPIC_API_KEY` | Anthropic-backed chat models |
| `OPENAI_API_KEY` | OpenAI-backed chat models |
| `CLERK_SECRET_KEY` | Server auth |
| `CLERK_PUBLISHABLE_KEY` | Server auth |
| `CLERK_FRONTEND_API` | OAuth config |
| `CLERK_OAUTH_CLIENT_ID` | OAuth config |
| `CLERK_OAUTH_CLIENT_SECRET` | OAuth configuration when required by Clerk |
| `POLAR_ACCESS_TOKEN` | Billing |
| `POLAR_PRODUCT_ID` | Billing |
| `POLAR_CREDITS_METER_ID` | Billing |
| `SENTRY_DSN` | Optional server error reporting |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional server trace sampling from 0 to 1 |

## MCP Contributions

MCP changes should preserve the default-deny security model. New MCP behavior
must keep tool access explicit and must not leak resolved secret values back to
the client.

## CodexaLens Contributions

CodexaLens should stay project-scoped and safe around filesystem boundaries. When
changing graphing or activity tracking, include tests for path normalization,
external imports, failed tool calls, and verification commands when relevant.

## Release Changes

Distribution changes can affect all supported platforms. For release scripts, installer scripts, or Homebrew formula generation, review [docs/RELEASING.md](./docs/RELEASING.md) and verify the platform matrix where possible.

## Docker Compose Environment Setup

For contributors who do not want to run PostgreSQL or Hono server directly on their host system, a pre-configured Docker Compose stack is available.

1. Ensure Docker and Docker Compose are installed.
2. Spin up the container services:
   ```sh
   docker compose -f docker/compose.yml up -d
   ```
3. This boots a local PostgreSQL database and starts the API server with hot-reloading at `http://localhost:3000`. Edit local workspace files as normal; changes will be immediately synced and loaded inside the container.
4. View container logs using:
   ```sh
   docker compose -f docker/compose.yml logs -f server
   ```

## Windows-Specific Dev Notes

While development is supported on Windows native environments, we strongly suggest using **WSL2 (Windows Subsystem for Linux)** with an Ubuntu distribution to match the production script runners and target builds.

If developing natively on Windows:
- Use PowerShell 7+ rather than standard Command Prompt (cmd).
- Be mindful of path separators (`\` vs `/`). Always use standard Node/Bun `path` modules (`path.join`, `path.resolve`) to normalize separators.
- Ensure your Git client configuration has `core.autocrlf` set to `input` or `false` to avoid formatting mismatches on shell files:
  ```powershell
  git config --global core.autocrlf input
  ```

## Good First Issues & Starter Areas

We tag newcomer-friendly issues with the `good-first-issue` and `help-wanted` labels. If you are looking for somewhere to start:
- **CLI improvements**: Add terminal TUI command shortcuts or improve theme styles in `packages/cli`.
- **Typing safety**: Tighten TypeScript configurations or expand schemas in `packages/shared`.
- **Documentation**: Expand API response formats, example configurations, or workflow guides.

## Detailed Testing Guidelines

Always run quality gates and test suites before pushing changes. To run specific test suites:

- **All tests**: `bun test`
- **Database schemas**: `bun run --cwd packages/database db:generate`
- **Server endpoints**: `bun test packages/server/src/routes`
- **CLI integration/TUI tests**: `bun test packages/cli`
- **CodexaLens Graph & Workspace**: `bun test packages/shared/src/codexalens-workspace.test.ts`

If code changes affect Prisma schemas, ensure to push the database schema changes to your local testing DB:
```sh
bun run db:push
```

## Reporting Issues

When opening an issue, include:

- Operating system and architecture.
- Install method.
- CODEXA version from `codexa --version`.
- The command or workflow that failed.
- Any relevant terminal output with secrets removed.

## License

By contributing, you agree that your contribution will be licensed under the
repository's MIT License.
