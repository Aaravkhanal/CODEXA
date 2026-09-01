# CODEXA Benchmark Methodology

This document describes how the CODEXA benchmark harness (`bun run bench`) works, how results are interpreted, and how to add new tasks.

---

## Overview

The benchmark harness at [`scripts/bench.ts`](../scripts/bench.ts) runs CODEXA against a small structured set of local verification tasks and reports pass/fail, duration, and estimated cost per task.

```
bun run bench          # run all tasks
bun run bench:dry      # list tasks without executing
bun run bench --task <id>  # run a single task by ID
```

Results are written to `bench/results/<timestamp>.json` for reproducible comparison.

---

## How Tasks Are Structured

Each task is a JSON file in `bench/tasks/` conforming to this schema:

```jsonc
{
  // Unique kebab-case identifier (also used as --task filter value)
  "id": "verify-bun-tests-pass",

  // Human-readable description shown in the table
  "description": "All bun test suite tests pass with exit code 0",

  // Directory to execute commands in (relative to repo root)
  "workdir": ".",

  // Shell command whose exit code determines pass (0) or fail (non-0)
  "verifyCommand": "bun test --bail",

  // Optional: run before the verify command (e.g. seed a fixture)
  "setupCommand": null,

  // Optional: always run after verify (cleanup)
  "teardownCommand": null,

  // Informational: token budget hint for agent tasks
  "tokenBudget": 200
}
```

---

## Existing Tasks

| Task ID | Description |
|---|---|
| `verify-bun-tests-pass` | All `bun test` suite tests pass exit 0 |
| `typecheck-all-packages` | TypeScript typechecks cleanly across all packages |
| `cli-help-contains-lens` | `--help` output includes `lens export` docs |
| `doctor-checks-pass` | `codexa doctor` exits 0 with no critical failures |
| `lens-export-html` | `lens export` writes valid HTML to disk |

---

## Adding New Tasks

1. Create a new file in `bench/tasks/<your-task-id>.json`.
2. Populate the required fields: `id`, `description`, `workdir`, `verifyCommand`.
3. Run `bun run bench:dry` to confirm your task appears in the registry.
4. Run `bun run bench --task <your-task-id>` to validate it works.

Tasks should be:
- **Self-contained**: no external network, no live API keys required.
- **Deterministic**: same environment → same result every time.
- **Fast**: verification commands should complete in under 60 seconds.

---

## Agent-Backed Tasks (Future)

Tasks can optionally include an `agentPrompt` field (not yet implemented) that runs the CODEXA agent against a fixture directory before the `verifyCommand` is executed. This allows measuring whether the agent can genuinely fix a bug or pass tests without prior knowledge.

> [!NOTE]
> Agent-backed task execution requires a running CODEXA server and an active API key. The current offline tasks exercise CODEXA's built-in tooling only.

---

## Reading Results

JSON result files in `bench/results/` are structured as `BenchmarkReport`:

```jsonc
{
  "runId": "bench-1725123456789",
  "timestamp": "2026-09-01T22:00:00Z",
  "totalTasks": 5,
  "passed": 5,
  "failed": 0,
  "totalDurationMs": 12340,
  "totalEstimatedCostUsd": 0.0001,
  "results": [ ... ]
}
```

To compare two runs:
```bash
diff bench/results/bench-<old>.json bench/results/bench-<new>.json
```

---

## CI Integration

Add to `.github/workflows/ci.yml` under an optional step:

```yaml
- name: Run Benchmarks
  run: bun run bench
  continue-on-error: true   # non-blocking until tasks are stable
```
