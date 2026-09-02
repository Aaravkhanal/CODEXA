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

## Agent-Backed Tasks

Tasks can optionally include an `agentPrompt` field that runs the sub-agent delegation flow against a target directory before the `verifyCommand` is executed. This allows measuring whether CODEXA can fix bugs or complete instructions within a specified token budget.

```jsonc
{
  "id": "agent-fix-failing-test",
  "description": "Agent receives bug report and fixes failing test suite",
  "workdir": ".",
  "agentPrompt": "Investigate failing test in packages/cli/test/sub-agent.test.ts and fix it.",
  "verifyCommand": "bun test packages/cli/test/sub-agent.test.ts",
  "tokenBudget": 500
}
```

- **Offline Mode (Default)**: Executes sub-agent delegation with offline verification.
- **Live Mode (`bun run bench --live`)**: Connects sub-agent execution to a running CODEXA server / model API key with isolated token tracking.

---

## Public Benchmark Harness (SWE-bench & Terminal-Bench Integration)

CODEXA supports running benchmark tasks derived from recognized public benchmarks such as **SWE-bench Lite** and **Terminal-Bench**. Public benchmark task definitions are located under `bench/tasks/public/` and tagged with `"suite": "public-swe-bench"` or `"suite": "public-terminal-bench"`.

### Execution Commands

```sh
bun run bench:public          # Run all public benchmark suite tasks (offline mode)
bun run bench:public --live   # Run public benchmark tasks against live LLM model
```

### Integrated Public Benchmark Tasks

| Task ID | Suite | Description | Token Budget |
|---|---|---|---|
| `swe-bench-lite-sympy-13031` | `public-swe-bench` | Fix Matrix.hstack/vstack empty zero-row return behavior in SymPy | 1500 |
| `terminal-bench-git-conflict` | `public-terminal-bench` | Resolve multi-file git merge conflicts and verify clean working tree | 1000 |

### Reproduction & Methodology

- **Model Context**: Live evaluations are executed against `claude-3-5-sonnet` via `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.
- **Environment**: Isolated workspace directory with child sub-agent token budget caps.
- **Verification**: Post-execution shell verification command (`verifyCommand`) determines pass (exit 0) or fail.

> [!NOTE]
> **Live Execution Results Placeholder**: Live benchmark evaluation requires an active API key and external LLM API access. Offline test suite runs execute default verification steps. To run and capture live benchmark scores:
> ```sh
> ANTHROPIC_API_KEY="your-key" bun run bench:public --live
> ```

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
