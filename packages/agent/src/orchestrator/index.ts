/**
 * CODEXA Multi-Agent Orchestrator
 *
 * Routes tasks to specialized sub-agents based on task complexity and type.
 *
 * Pipeline:
 *   EXPLORER → PLANNER → CODER → TESTER → DEBUGGER (if needed) → REVIEWER
 *
 * Each agent receives:
 *   - Task description
 *   - Project context (relevant files)
 *   - Results from previous agents
 *   - Tool execution capability
 *
 * The orchestrator emits progress events so the TUI can display live status.
 */

import { generateText, type LanguageModel } from "ai";
import type { ProjectContext } from "../context/engine.ts";
import { ContextEngine } from "../context/engine.ts";
import type { ProviderConfig } from "../providers/index.ts";
import { createLanguageModel } from "../providers/index.ts";
import type { AgentTools } from "../tools/executor.ts";
import { createAgentTools } from "../tools/executor.ts";

// ... (rest unchanged until sub-agents) ...

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentPhase =
  | "exploring"
  | "planning"
  | "coding"
  | "testing"
  | "debugging"
  | "reviewing"
  | "done"
  | "failed";

export interface AgentProgressEvent {
  phase: AgentPhase;
  message: string;
  detail?: string;
  filesModified?: string[];
  testsResult?: TestResult;
}

export interface TestResult {
  passed: boolean;
  output: string;
  exitCode: number;
}

export interface OrchestratorOptions {
  /** Provider configuration for the primary (coding) model */
  providerConfig: ProviderConfig;
  /** Optional cheaper model for planning/reviewing. Falls back to primary if not set. */
  planProviderConfig?: ProviderConfig;
  /** Working directory of the user's project */
  cwd: string;
  /** Auto-approve all tool executions without asking */
  autoApprove?: boolean;
  /** Max retries in the debugger loop */
  maxDebugRetries?: number;
  /** Token budget for context engine */
  tokenBudget?: number;
  /** Callback for dangerous command confirmation */
  onConfirmDangerous?: (command: string, description: string) => Promise<boolean>;
  /** Callback to stream progress events to the TUI */
  onProgress?: (event: AgentProgressEvent) => void;
}

export interface OrchestratorResult {
  success: boolean;
  summary: string;
  filesModified: string[];
  testsRun: boolean;
  testsPassed: boolean | null;
  debugRetries: number;
  totalTokensUsed: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class AgentOrchestrator {
  private readonly options: Required<OrchestratorOptions>;
  private readonly model: LanguageModel;
  private readonly planModel: LanguageModel;
  private readonly contextEngine: ContextEngine;
  private readonly tools: AgentTools;
  private totalTokensUsed = 0;

  constructor(options: OrchestratorOptions) {
    this.options = {
      autoApprove: false,
      maxDebugRetries: 3,
      tokenBudget: 80_000,
      onConfirmDangerous: async () => false,
      onProgress: () => {},
      planProviderConfig: options.providerConfig,
      ...options,
    };

    this.model = createLanguageModel(this.options.providerConfig);
    this.planModel = createLanguageModel(this.options.planProviderConfig);
    this.contextEngine = new ContextEngine(this.options.cwd, this.options.tokenBudget);
    this.tools = createAgentTools({
      cwd: this.options.cwd,
      autoApprove: this.options.autoApprove,
      onConfirmDangerous: this.options.onConfirmDangerous,
    });
  }

  /**
   * Run the full agent pipeline for a given task.
   */
  async run(task: string): Promise<OrchestratorResult> {
    const startMs = Date.now();
    const emit = (event: AgentProgressEvent) => this.options.onProgress(event);
    let filesModified: string[] = [];
    let debugRetries = 0;
    let testsPassed: boolean | null = null;
    let testsRun = false;

    try {
      // ── Phase 1: Explorer ────────────────────────────────────────────────
      emit({ phase: "exploring", message: "Exploring project structure..." });
      const context = await this.contextEngine.buildContext(task);
      const explorationSummary = await this.runExplorer(task, context);
      emit({
        phase: "exploring",
        message: `✓ Project understood (${context.files.length} relevant files)`,
        detail: explorationSummary,
      });

      // ── Phase 2: Planner ─────────────────────────────────────────────────
      emit({ phase: "planning", message: "Creating implementation plan..." });
      const plan = await this.runPlanner(task, context, explorationSummary);
      emit({ phase: "planning", message: "✓ Plan ready", detail: plan });

      // ── Phase 3: Coder ───────────────────────────────────────────────────
      emit({ phase: "coding", message: "Implementing changes..." });
      const codingResult = await this.runCoder(task, context, plan);
      filesModified = codingResult.filesModified;
      emit({
        phase: "coding",
        message: `✓ ${filesModified.length} file(s) modified`,
        filesModified,
      });

      // ── Phase 4: Tester ──────────────────────────────────────────────────
      emit({ phase: "testing", message: "Running tests and build verification..." });
      const testResult = await this.runTester(context);
      testsRun = true;
      testsPassed = testResult.passed;
      emit({
        phase: "testing",
        message: testResult.passed ? "✓ Tests passed" : "✗ Tests failed",
        testsResult: testResult,
      });

      // ── Phase 4a: Debugger (if tests failed) ─────────────────────────────
      if (!testResult.passed) {
        let currentTestResult = testResult;

        while (!currentTestResult.passed && debugRetries < this.options.maxDebugRetries) {
          debugRetries++;
          emit({
            phase: "debugging",
            message: `Fixing failures (attempt ${debugRetries}/${this.options.maxDebugRetries})...`,
            detail: currentTestResult.output,
          });

          const fixResult = await this.runDebugger(task, context, plan, currentTestResult);
          filesModified = [...new Set([...filesModified, ...fixResult.filesModified])];

          emit({ phase: "testing", message: "Re-running tests..." });
          currentTestResult = await this.runTester(context);
          testsPassed = currentTestResult.passed;

          emit({
            phase: "testing",
            message: currentTestResult.passed
              ? `✓ Tests passed after ${debugRetries} fix attempt(s)`
              : `✗ Tests still failing (attempt ${debugRetries})`,
            testsResult: currentTestResult,
          });
        }
      }

      // ── Phase 5: Reviewer ────────────────────────────────────────────────
      emit({ phase: "reviewing", message: "Reviewing changes for correctness..." });
      const reviewSummary = await this.runReviewer(task, filesModified);
      emit({ phase: "reviewing", message: "✓ Review complete", detail: reviewSummary });

      // ── Done ─────────────────────────────────────────────────────────────
      emit({ phase: "done", message: "Task completed successfully" });

      return {
        success: true,
        summary: reviewSummary,
        filesModified,
        testsRun,
        testsPassed,
        debugRetries,
        totalTokensUsed: this.totalTokensUsed,
        durationMs: Date.now() - startMs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ phase: "failed", message: `Task failed: ${message}` });
      return {
        success: false,
        summary: message,
        filesModified,
        testsRun,
        testsPassed,
        debugRetries,
        totalTokensUsed: this.totalTokensUsed,
        durationMs: Date.now() - startMs,
      };
    }
  }

  // ── Sub-agent implementations ──────────────────────────────────────────

  private async runExplorer(task: string, context: ProjectContext): Promise<string> {
    const fileList = context.files
      .slice(0, 20)
      .map((f) => `  ${f.path} (relevance: ${f.relevanceScore.toFixed(1)})`)
      .join("\n");

    const { text, usage } = await (generateText as any)({
      model: this.planModel,
      system: EXPLORER_SYSTEM_PROMPT,
      prompt: `Task: ${task}\n\nTop relevant files:\n${fileList}\n\nProvide a concise understanding of the project structure and what files will need to be modified for this task.`,
    });
    this.totalTokensUsed += (usage?.totalTokens ?? 0);
    return text;
  }

  private async runPlanner(
    task: string,
    context: ProjectContext,
    explorationSummary: string,
  ): Promise<string> {
    const contextBlock = context.files
      .slice(0, 5)
      .map((f) => `\`\`\`${getFileExtension(f.path)}\n// ${f.path}\n${f.content.slice(0, 2000)}\n\`\`\``)
      .join("\n\n");

    const { text, usage } = await (generateText as any)({
      model: this.planModel,
      system: PLANNER_SYSTEM_PROMPT,
      prompt: `Task: ${task}\n\nProject understanding:\n${explorationSummary}\n\nKey files:\n${contextBlock}\n\nCreate a numbered, step-by-step implementation plan.`,
    });
    this.totalTokensUsed += (usage?.totalTokens ?? 0);
    return text;
  }

  private async runCoder(
    task: string,
    context: ProjectContext,
    plan: string,
  ): Promise<{ filesModified: string[] }> {
    const filesModified: string[] = [];

    const contextBlock = context.files
      .map((f) => `\`\`\`${getFileExtension(f.path)}\n// FILE: ${f.path}\n${f.content}\n\`\`\``)
      .join("\n\n");

    await (generateText as any)({
      model: this.model,
      system: CODER_SYSTEM_PROMPT,
      tools: this.tools,
      prompt: `Task: ${task}\n\nImplementation plan:\n${plan}\n\nProject files:\n${contextBlock}`,
      onStepFinish({ toolResults }: any) {
        for (const result of toolResults ?? []) {
          if (
            ["writeFile", "editFile", "deleteFile", "moveFile"].includes(result.toolName)
          ) {
            const path = (result as any)?.result?.path ?? (result as any)?.output?.path;
            if (path && !filesModified.includes(path)) filesModified.push(path);
          }
        }
      },
    });

    return { filesModified };
  }

  private async runTester(context: ProjectContext): Promise<TestResult> {
    // Detect test/build commands from context
    const pkgJson = context.files.find((f) => f.path === "package.json");
    let testCommand: string | null = null;

    if (pkgJson) {
      try {
        const pkg = JSON.parse(pkgJson.content);
        if (pkg.scripts?.test) testCommand = "npm test";
        else if (pkg.scripts?.["test:run"]) testCommand = "npm run test:run";
      } catch {}
    }

    if (!testCommand) {
      // Check for other ecosystems
      const hasPyproject = context.files.some((f) => f.path === "pyproject.toml");
      const hasRequirements = context.files.some((f) => f.path === "requirements.txt");
      const hasCargo = context.files.some((f) => f.path === "Cargo.toml");
      const hasGoMod = context.files.some((f) => f.path === "go.mod");

      if (hasPyproject || hasRequirements) testCommand = "python -m pytest";
      else if (hasCargo) testCommand = "cargo test";
      else if (hasGoMod) testCommand = "go test ./...";
    }

    if (!testCommand) {
      return {
        passed: true,
        output: "⚠ No test command detected. Skipping test verification.",
        exitCode: 0,
      };
    }

    // Execute the test command via the bash tool
    const bashExec = this.tools.bash.execute as unknown as (args: {
      command: string;
      description?: string;
      timeout?: number;
    }) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

    const result = await bashExec({
      command: testCommand,
      description: "Run project tests",
      timeout: 120_000,
    });

    return {
      passed: result.exitCode === 0,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
      exitCode: result.exitCode,
    };
  }

  private async runDebugger(
    task: string,
    context: ProjectContext,
    plan: string,
    testResult: TestResult,
  ): Promise<{ filesModified: string[] }> {
    const filesModified: string[] = [];

    const contextBlock = context.files
      .slice(0, 8)
      .map((f) => `\`\`\`${getFileExtension(f.path)}\n// ${f.path}\n${f.content}\n\`\`\``)
      .join("\n\n");

    await (generateText as any)({
      model: this.model,
      system: DEBUGGER_SYSTEM_PROMPT,
      tools: this.tools,
      prompt: `Original task: ${task}\n\nOriginal plan:\n${plan}\n\nTest failure output:\n${testResult.output}\n\nProject files:\n${contextBlock}\n\nAnalyze the test failure and fix the root cause.`,
      onStepFinish({ toolResults }: any) {
        for (const result of toolResults ?? []) {
          if (
            ["writeFile", "editFile", "deleteFile", "moveFile"].includes(result.toolName)
          ) {
            const path = (result as any)?.result?.path ?? (result as any)?.output?.path;
            if (path && !filesModified.includes(path)) filesModified.push(path);
          }
        }
      },
    });

    return { filesModified };
  }

  private async runReviewer(task: string, filesModified: string[]): Promise<string> {
    if (filesModified.length === 0) {
      return "No files were modified.";
    }

    // Read modified files for review
    const fileContents = filesModified
      .slice(0, 10)
      .map((path) => {
        try {
          const content = this.contextEngine.readFile(path);
          return `\`\`\`${getFileExtension(path)}\n// ${path}\n${content.slice(0, 3000)}\n\`\`\``;
        } catch {
          return `// ${path} (could not read)`;
        }
      })
      .join("\n\n");

    const { text, usage } = await (generateText as any)({
      model: this.planModel,
      system: REVIEWER_SYSTEM_PROMPT,
      prompt: `Original task: ${task}\n\nModified files:\n${fileContents}\n\nProvide a concise code review summary. Identify any obvious issues, missing error handling, or improvements.`,
    });
    this.totalTokensUsed += (usage?.totalTokens ?? 0);
    return text;
  }
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const EXPLORER_SYSTEM_PROMPT = `You are the Explorer agent in CODEXA's multi-agent AI coding system.
Your role is to understand the project structure and identify what files are relevant to the task.
Be concise. Output a 3-5 sentence summary of:
1. What the project does
2. Which files are most relevant to the task
3. What approach would work best`;

const PLANNER_SYSTEM_PROMPT = `You are the Planner agent in CODEXA's multi-agent AI coding system.
Your role is to create a detailed, numbered, step-by-step implementation plan.
Be specific about which files to modify and what changes to make.
Do NOT implement code — only plan.
Be actionable and precise.`;

const CODER_SYSTEM_PROMPT = `You are the Coder agent in CODEXA's multi-agent AI coding system.
Your role is to implement the plan by modifying files using the available tools.

CRITICAL RULES:
- Use writeFile to create new files
- Use editFile to make targeted changes to existing files (prefer this over rewriting entire files)
- Use bash to run commands when needed (install deps, build steps, etc.)
- NEVER claim a file was changed if you didn't actually change it
- If you're unsure, read the file first before editing
- Follow the existing code style and conventions in each file`;

const DEBUGGER_SYSTEM_PROMPT = `You are the Debugger agent in CODEXA's multi-agent AI coding system.
Tests have failed. Your role is to:
1. Carefully read the test failure output
2. Identify the root cause
3. Fix the specific issue using available tools
4. Do NOT make unrelated changes

Be surgical — only fix what's broken.`;

const REVIEWER_SYSTEM_PROMPT = `You are the Reviewer agent in CODEXA's multi-agent AI coding system.
Review the changes made and provide honest, concise feedback:
- Are there obvious bugs?
- Is error handling adequate?
- Are there any security concerns?
- Do the changes match what was requested?

Be brief (5-8 sentences max). Be honest — do not sugarcoat issues.`;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getFileExtension(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sh: "bash",
    sql: "sql",
  };
  return extMap[ext] ?? ext;
}
