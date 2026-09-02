/**
 * CODEXA Benchmark Harness
 *
 * Runs CODEXA against a structured set of local coding tasks and emits a
 * pass/fail + cost-per-task summary to stdout.  A JSON results file is also
 * written to bench/results/<timestamp>.json so results are reproducible.
 *
 * Usage:
 *   bun run bench                    # run all tasks
 *   bun run bench --task fix-off-by-one  # run a single named task
 *   bun run bench --dry              # list tasks, skip execution
 *
 * See docs/BENCHMARKS.md for methodology and how to add new tasks.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

import { spawnSubAgent, type LiveAgentContext } from "../packages/cli/src/lib/sub-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkTask {
  /** Unique short identifier, kebab-case */
  id: string;
  /** Human-readable description shown in the summary table */
  description: string;
  /** Directory to run the task in (relative to repo root) */
  workdir: string;
  /** Shell command to verify the task is complete.  Exit-0 = pass. */
  verifyCommand: string;
  /** Optional setup shell command to run before the agent */
  setupCommand?: string;
  /** Optional teardown shell command (always runs even on failure) */
  teardownCommand?: string;
  /** Estimated token budget for this task (informational or live execution cap) */
  tokenBudget?: number;
  /** Prompt for an agent-backed benchmark task (runs CODEXA before verifyCommand) */
  agentPrompt?: string;
}

export interface BenchmarkResult {
  taskId: string;
  passed: boolean;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  /** Token estimate based on output length or live sub-agent execution */
  estimatedTokens: number;
  estimatedCostUsd: number;
}

export interface BenchmarkReport {
  runId: string;
  timestamp: string;
  totalTasks: number;
  passed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  totalEstimatedCostUsd: number;
  results: BenchmarkResult[];
}

// ---------------------------------------------------------------------------
// Task Registry
// ---------------------------------------------------------------------------

/**
 * Load task definitions from bench/tasks/*.json
 * Each .json file must conform to BenchmarkTask.
 */
function loadTasksSync(tasksDir: string): BenchmarkTask[] {
  if (!existsSync(tasksDir)) return [];
  const { readdirSync } = require("node:fs");
  const files: string[] = readdirSync(tasksDir).filter((f: string) => f.endsWith(".json"));
  const tasks: BenchmarkTask[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(tasksDir, file), "utf-8");
      tasks.push(JSON.parse(raw) as BenchmarkTask);
    } catch (err: any) {
      console.warn(`⚠  Skipping malformed task file ${file}: ${err.message}`);
    }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function runShell(cmd: string, cwd: string, timeoutMs = 30_000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: "utf-8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
    return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: (err.stdout ?? "").trim(),
      stderr: (err.stderr ?? err.message ?? "").trim(),
      exitCode: typeof err.status === "number" ? err.status : 1,
    };
  }
}

async function runTask(task: BenchmarkTask, repoRoot: string, isLive = false): Promise<BenchmarkResult> {
  const cwd = resolve(repoRoot, task.workdir);
  const start = Date.now();

  // Setup
  if (task.setupCommand) {
    const s = runShell(task.setupCommand, cwd);
    if (s.exitCode !== 0) {
      return {
        taskId: task.id,
        passed: false,
        exitCode: s.exitCode,
        durationMs: Date.now() - start,
        stdout: s.stdout,
        stderr: `Setup failed: ${s.stderr}`,
        estimatedTokens: 0,
        estimatedCostUsd: 0,
      };
    }
  }

  let agentTokens = 0;
  let agentCost = 0;
  let agentOutput = "";

  // Agent-backed execution step (if agentPrompt is set)
  if (task.agentPrompt) {
    const liveContext: LiveAgentContext | undefined = isLive || process.env.CODEXA_API_URL || process.env.ANTHROPIC_API_KEY
      ? {
          apiUrl: process.env.CODEXA_API_URL || "http://localhost:3000",
          apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
        }
      : undefined;

    const subAgentResult = await spawnSubAgent(
      {
        id: `bench-${task.id}`,
        goal: task.agentPrompt,
        cwd,
        maxTokens: task.tokenBudget ?? 500,
      },
      "bench-harness",
      liveContext,
    );

    agentTokens = subAgentResult.tokensUsed;
    agentCost = subAgentResult.estimatedCostUsd;
    agentOutput = subAgentResult.output;
  }

  // Verify
  const result = runShell(task.verifyCommand, cwd, 60_000);
  const durationMs = Date.now() - start;
  const passed = result.exitCode === 0;
  const outputLength = result.stdout.length + result.stderr.length;
  const estimatedTokens = agentTokens || Math.ceil(outputLength / 4);
  const estimatedCostUsd = agentCost || estimatedTokens * 0.000003;

  // Teardown (always)
  if (task.teardownCommand) {
    runShell(task.teardownCommand, cwd);
  }

  return {
    taskId: task.id,
    passed,
    exitCode: result.exitCode,
    durationMs,
    stdout: [agentOutput, result.stdout].filter(Boolean).join("\n").slice(0, 2000),
    stderr: result.stderr.slice(0, 2000),
    estimatedTokens,
    estimatedCostUsd,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const SKIP = "\x1b[33m–\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function formatMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function printReport(report: BenchmarkReport) {
  console.log(`\n${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  CODEXA Benchmark Report  ·  ${report.timestamp}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n`);

  const colW = [30, 8, 12, 14];
  const header = [
    "Task".padEnd(colW[0]!),
    "Result".padEnd(colW[1]!),
    "Duration".padEnd(colW[2]!),
    "Est. Cost".padEnd(colW[3]!),
  ].join("  ");
  console.log(`  ${BOLD}${header}${RESET}`);
  console.log(`  ${"─".repeat(header.length)}`);

  for (const r of report.results) {
    const icon = r.passed ? PASS : FAIL;
    const row = [
      r.taskId.padEnd(colW[0]!),
      (r.passed ? "PASS" : "FAIL").padEnd(colW[1]!),
      formatMs(r.durationMs).padEnd(colW[12]!),
      `$${r.estimatedCostUsd.toFixed(5)}`.padEnd(colW[3]!),
    ].join("  ");
    console.log(`  ${icon} ${row}`);

    if (!r.passed && r.stderr) {
      const lines = r.stderr.split("\n").slice(0, 3);
      for (const line of lines) {
        console.log(`      \x1b[31m${line}\x1b[0m`);
      }
    }
  }

  console.log(`\n  ${"─".repeat(header.length)}`);
  console.log(
    `  ${BOLD}${report.passed}/${report.totalTasks} passed${RESET}  ·  ${report.failed} failed  ·  ${formatMs(report.totalDurationMs)}  ·  est. $${report.totalEstimatedCostUsd.toFixed(5)} total`,
  );
  console.log();
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, "..");
const TASKS_DIR = join(REPO_ROOT, "bench", "tasks");
const RESULTS_DIR = join(REPO_ROOT, "bench", "results");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry");
const isLive = argv.includes("--live");
const taskFilter = argv.includes("--task") ? argv[argv.indexOf("--task") + 1] : undefined;

const allTasks = loadTasksSync(TASKS_DIR);
const tasks = taskFilter ? allTasks.filter((t) => t.id === taskFilter) : allTasks;

if (tasks.length === 0) {
  console.log("No benchmark tasks found. Add task JSON files to bench/tasks/.");
  console.log(`Example: bench/tasks/fix-off-by-one.json`);
  process.exit(0);
}

if (dryRun) {
  console.log(`\n${BOLD}Benchmark tasks (dry run):${RESET}`);
  for (const t of tasks) {
    const agentTag = t.agentPrompt ? " [Agent-backed]" : "";
    console.log(`  ${SKIP} ${t.id.padEnd(30)} ${t.description}${agentTag}`);
  }
  console.log(`\n  ${tasks.length} task(s) listed.\n`);
  process.exit(0);
}

// Run tasks
const runId = `bench-${Date.now()}`;
const timestamp = new Date().toISOString();
const results: BenchmarkResult[] = [];
let totalDurationMs = 0;

console.log(`\n${BOLD}CODEXA Benchmark${RESET}  ·  ${tasks.length} task(s)${isLive ? " [LIVE MODE]" : ""}  ·  ${timestamp}\n`);

for (const task of tasks) {
  process.stdout.write(`  Running ${BOLD}${task.id}${RESET} ... `);
  const result = await runTask(task, REPO_ROOT, isLive);
  results.push(result);
  totalDurationMs += result.durationMs;
  console.log(`${result.passed ? PASS + " PASS" : FAIL + " FAIL"} (${formatMs(result.durationMs)})`);
}

const report: BenchmarkReport = {
  runId,
  timestamp,
  totalTasks: tasks.length,
  passed: results.filter((r) => r.passed).length,
  failed: results.filter((r) => !r.passed).length,
  skipped: 0,
  totalDurationMs,
  totalEstimatedCostUsd: results.reduce((sum, r) => sum + r.estimatedCostUsd, 0),
  results,
};

printReport(report);

// Save results
mkdirSync(RESULTS_DIR, { recursive: true });
const outPath = join(RESULTS_DIR, `${runId}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
console.log(`  📊 Full results saved to: ${outPath}\n`);

process.exit(report.failed > 0 ? 1 : 0);
