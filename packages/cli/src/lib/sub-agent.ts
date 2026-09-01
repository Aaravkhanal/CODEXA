/**
 * CODEXA Sub-Agent Delegation
 *
 * Allows a BUILD-mode parent session to spawn a scoped child agent for a
 * narrow task (e.g. "make the failing tests pass").  The child agent gets:
 *   - Its own token budget
 *   - Its own PLAN/BUILD execution state (always BUILD)
 *   - An isolated working context with a specific goal prompt
 *
 * Results (pass/fail, output, token usage, timeline events) are returned to
 * the parent session and emitted as nested "sub-agent" Timeline entries.
 *
 * NOTE: Full LLM-backed child agent execution requires a running CODEXA server
 * or direct API key.  This module provides the delegation protocol and
 * scaffolding; the integration point in use-chat.ts wires it to the live agent.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CodexaLensActivityEvent } from "@codexa/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubAgentTask {
  /** Unique short identifier for this delegation (used in Timeline IDs) */
  id: string;
  /** Natural-language goal for the child agent */
  goal: string;
  /** Working directory (must be inside the parent cwd) */
  cwd: string;
  /** Maximum token budget for the child agent */
  maxTokens: number;
  /** Verification command to run after child agent completes */
  verifyCommand?: string;
  /** Whether the child is allowed to write files (default: true = BUILD) */
  allowWrites?: boolean;
}

export interface SubAgentResult {
  taskId: string;
  passed: boolean;
  exitCode: number;
  output: string;
  /** Tokens consumed by the child agent (stub — populated by live agent runtime) */
  tokensUsed: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  durationMs: number;
  /** Timeline events to be merged into the parent session's Timeline */
  timelineEvents: CodexaLensActivityEvent[];
}

// ---------------------------------------------------------------------------
// Sub-agent execution
// ---------------------------------------------------------------------------

/**
 * Spawn a child agent for the given task.
 *
 * In the current implementation this runs the verification command directly
 * (offline/local mode) and wraps the result as a sub-agent Timeline event.
 * When the CODEXA server is running and a live session is available, the
 * agent loop in use-chat.ts can call the server /chat endpoint with an
 * isolated system prompt and token budget instead.
 */
export async function spawnSubAgent(
  task: SubAgentTask,
  parentSessionId: string,
): Promise<SubAgentResult> {
  const startMs = Date.now();

  if (!existsSync(task.cwd)) {
    return makeFailResult(task, `Sub-agent cwd does not exist: ${task.cwd}`, startMs);
  }

  // Build the sub-agent "started" Timeline event visible in the parent
  const startedEvent = makeTimelineEvent(task, parentSessionId, "started", "inspected", startMs);

  // Offline verification path: run verifyCommand and treat exit-0 as success
  let passed = false;
  let output = "";
  let exitCode = 1;

  if (task.verifyCommand) {
    try {
      const proc = Bun.spawn(["bash", "-c", task.verifyCommand], {
        cwd: task.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      const timer = setTimeout(() => proc.kill(), 60_000);
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      exitCode = await proc.exited;
      clearTimeout(timer);

      passed = exitCode === 0;
      output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    } catch (err: any) {
      output = `Sub-agent execution error: ${err.message}`;
    }
  } else {
    // No verify command — treat as a planning delegation (always passes)
    passed = true;
    output = `[Sub-agent] Goal registered: "${task.goal}" — awaiting live agent execution`;
  }

  const durationMs = Date.now() - startMs;
  const tokensUsed = Math.ceil(output.length / 4);
  const estimatedCostUsd = tokensUsed * 0.000003;

  const completedEvent = makeTimelineEvent(
    task,
    parentSessionId,
    "completed",
    passed ? "verified" : "failed",
    startMs,
    durationMs,
    output,
  );

  return {
    taskId: task.id,
    passed,
    exitCode,
    output,
    tokensUsed,
    estimatedCostUsd,
    durationMs,
    timelineEvents: [startedEvent, completedEvent],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTimelineEvent(
  task: SubAgentTask,
  parentSessionId: string,
  phase: "started" | "completed",
  status: CodexaLensActivityEvent["status"],
  startMs: number,
  durationMs?: number,
  summary?: string,
): CodexaLensActivityEvent {
  return {
    id: `sub-agent:${task.id}:${phase}`,
    toolCallId: `sub-agent:${task.id}`,
    toolName: "sub-agent",
    phase,
    status,
    filePaths: [],
    mcpServer: undefined,
    timestampMs: Date.now(),
    offsetMs: Math.max(0, Date.now() - startMs),
    ...(durationMs !== undefined ? { durationMs } : {}),
    summary: summary ?? `[Sub-agent] ${task.goal}`,
  };
}

function makeFailResult(task: SubAgentTask, reason: string, startMs: number): SubAgentResult {
  const durationMs = Date.now() - startMs;
  return {
    taskId: task.id,
    passed: false,
    exitCode: 1,
    output: reason,
    tokensUsed: 0,
    estimatedCostUsd: 0,
    durationMs,
    timelineEvents: [
      makeTimelineEvent(task, "offline", "completed", "failed", startMs, durationMs, reason),
    ],
  };
}
