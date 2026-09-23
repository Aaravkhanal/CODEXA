# @aaravkhanal/codexa

CODEXA is a terminal-native AI coding agent. It works in the project directory
you launch it from, keeps provider credentials on the local machine, and lets
you review a plan before files are changed.

## Install

```sh
npm install -g @aaravkhanal/codexa
cd /path/to/your-project
codexa
```

The installed command is `codexa`; the scoped npm name only prevents a naming
collision with an unrelated public package.

## Useful commands

```sh
codexa setup                       # configure a provider and API key
codexa doctor                      # human-readable local diagnostics
codexa doctor --json               # diagnostics for CI or support scripts
codexa plan "add OAuth login"      # produce a read-only plan
codexa "fix the failing tests"     # run an implementation task
codexa --cwd ../another-project    # target a different project
```

## Development

From the repository root:

```sh
bun install
bun run dev:cli
bun test packages/cli
bun run build:cli
```

The npm installer is deliberately small: it downloads the matching verified
native binary from the GitHub Release for the package version. If a binary is
unavailable, it can still run from source when Bun is installed.

## Security model

- API keys are stored locally and are never sent to CODEXA telemetry.
- PLAN mode is read-only; BUILD mode presents tool permission prompts.
- `codexa doctor --json` is designed for reproducible onboarding and CI checks.

See the [repository documentation](https://github.com/Aaravkhanal/CODEXA) for
provider compatibility, releases, and contribution guidance.
