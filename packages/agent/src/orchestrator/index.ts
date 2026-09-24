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
import { DependencyManager } from "../dependencies/manager.ts";
import { ProjectIndexer } from "../index/project-indexer.ts";
import { ProjectMemoryManager } from "../memory/project-memory.ts";
import type { ProviderConfig } from "../providers/index.ts";
import { createLanguageModel } from "../providers/index.ts";
import { PermissionEngine } from "../safety/permission-engine.ts";
import { SkillManager } from "../skills/manager.ts";
import { CheckpointManager } from "../state/checkpoint-manager.ts";
import type { AgentTools } from "../tools/executor.ts";
import { createAgentTools } from "../tools/executor.ts";

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

export interface SafeEditPreview {
  files: string[];
  steps: string[];
  verificationCommands: string[];
  rawPlan: string;
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
  /** Lets an interactive client approve the exact edit preview before code can be changed. */
  onPlanReady?: (preview: SafeEditPreview) => Promise<boolean>;
}

export interface OrchestratorResult {
  success: boolean;
  summary: string;
  filesModified: string[];
  testsRun: boolean;
  testsPassed: boolean | null;
  debugRetries: number;
  totalTokensUsed: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
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
  private readonly skillManager: SkillManager;
  private readonly projectIndexer: ProjectIndexer;
  private readonly checkpointManager: CheckpointManager;
  private readonly dependencyManager: DependencyManager;
  private readonly permissionEngine: PermissionEngine;
  private readonly memoryManager: ProjectMemoryManager;
  private totalTokensUsed = 0;
  private inputTokensUsed = 0;
  private outputTokensUsed = 0;

  constructor(options: OrchestratorOptions) {
    this.options = {
      autoApprove: false,
      maxDebugRetries: 3,
      tokenBudget: 80_000,
      onConfirmDangerous: async () => false,
      onProgress: () => {},
      onPlanReady: async () => true,
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
    this.skillManager = new SkillManager(this.options.cwd);
    this.projectIndexer = new ProjectIndexer(this.options.cwd);
    this.checkpointManager = new CheckpointManager(this.options.cwd);
    this.dependencyManager = new DependencyManager(this.options.cwd);
    this.permissionEngine = new PermissionEngine();
    this.memoryManager = new ProjectMemoryManager(this.options.cwd);
  }

  /**
   * Run the full agent pipeline for a given task.
   */
  async run(task: string): Promise<OrchestratorResult> {
    const startMs = Date.now();
    this.resetUsage();
    const emit = (event: AgentProgressEvent) => this.options.onProgress(event);
    let filesModified: string[] = [];
    let debugRetries = 0;
    let testsPassed: boolean | null = null;
    let testsRun = false;

    try {
      // ── Phase 0: Skill Matching (read-only until preview approval) ─────
      const detectedSkills = this.skillManager.detectSkillsForTask(task);
      const skillInstructions = detectedSkills
        .map(
          (s) =>
            `[SKILL: ${s.name}]\nDescription: ${s.description}\nRecommended Workflow: ${s.recommendedWorkflow.join(" -> ")}`,
        )
        .join("\n\n");
      const skillsDetail =
        detectedSkills.length > 0
          ? `Loaded skills: ${detectedSkills.map((s) => s.name).join(", ")}`
          : "No specific skills matched";

      // ── Phase 1: Explorer & Project Knowledge Graph ────────────────────
      emit({
        phase: "exploring",
        message: "Analyzing project structure & Knowledge Graph...",
        detail: skillsDetail,
      });
      const graph = this.projectIndexer.generateKnowledgeGraph(false);
      const projectMemory =
        this.memoryManager.readMemory() ?? "No previous project memory recorded.";
      const graphContextStr = `Project Name: ${graph.projectName}\nFrameworks: ${graph.frameworks.join(", ") || "none"}\nLanguages: ${graph.languages.join(", ") || "none"}\nPackage Manager: ${graph.packageManager}\nDatabase: ${graph.databaseType || "none"}\nArchitecture Notes: ${graph.architectureNotes.join("; ") || "standard"}\n\nProject Memory:\n${projectMemory.slice(0, 3000)}`;

      const context = await this.contextEngine.buildContext(task);
      const explorationSummary = await this.runExplorer(
        task,
        context,
        graphContextStr,
        skillInstructions,
      );
      emit({
        phase: "exploring",
        message: `✓ Project '${graph.projectName}' analyzed (${context.files.length} relevant files)`,
        detail: explorationSummary,
      });

      // ── Phase 2: Planner ─────────────────────────────────────────────────
      emit({ phase: "planning", message: "Creating implementation plan..." });
      const plan = await this.runPlanner(task, context, explorationSummary, skillInstructions);
      const verificationCommand = this.detectTestCommand(context);
      const preview = createSafeEditPreview(
        plan,
        context.files.map((file) => file.path),
        verificationCommand ? [verificationCommand] : [],
      );
      emit({
        phase: "planning",
        message: "✓ Safe edit preview ready",
        detail: formatSafeEditPreview(preview),
      });

      const planApproved = await this.options.onPlanReady(preview);
      if (!planApproved) {
        const summary = "Implementation cancelled before any files were changed.";
        emit({ phase: "done", message: summary });
        return {
          success: true,
          summary,
          filesModified,
          testsRun,
          testsPassed,
          debugRetries,
          totalTokensUsed: this.totalTokensUsed,
          inputTokensUsed: this.inputTokensUsed,
          outputTokensUsed: this.outputTokensUsed,
          durationMs: Date.now() - startMs,
        };
      }

      // Approval is the first point where CODEXA may write project metadata.
      emit({ phase: "exploring", message: "Creating safety checkpoint..." });
      this.checkpointManager.createCheckpoint(`Pre-task: ${task.slice(0, 40)}`);
      this.projectIndexer.generateKnowledgeGraph(true);

      // ── Phase 3: Coder & Dependency Check ───────────────────────────────
      emit({ phase: "coding", message: "Verifying project dependencies..." });
      const packagesToVerify = this.dependencyManager.getInstalledPackages();
      const depPlan = this.dependencyManager.planDependencies(Array.from(packagesToVerify));
      if (depPlan.missing.length > 0) {
        emit({
          phase: "coding",
          message: `Installing missing packages: ${depPlan.missing.join(", ")}`,
        });
        this.dependencyManager.installMissing(depPlan.missing);
      }

      emit({ phase: "coding", message: "Implementing changes..." });
      const codingResult = await this.runCoder(task, context, plan, skillInstructions);
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

      // Record incremental session summary in project memory
      try {
        this.memoryManager.recordSessionSummary({
          sessionId: `session_${Date.now()}`,
          timestamp: Date.now(),
          task,
          summary: reviewSummary || "Task completed successfully",
          filesModified,
          testsRun,
          testsPassed,
        });
      } catch {}

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
        inputTokensUsed: this.inputTokensUsed,
        outputTokensUsed: this.outputTokensUsed,
        durationMs: Date.now() - startMs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ phase: "failed", message: `Task failed: ${message}` });

      try {
        this.memoryManager.recordSessionSummary({
          sessionId: `session_${Date.now()}`,
          timestamp: Date.now(),
          task,
          summary: `Task stopped with error: ${message}`,
          filesModified,
          testsRun,
          testsPassed: false,
        });
      } catch {}

      return {
        success: false,
        summary: message,
        filesModified,
        testsRun,
        testsPassed,
        debugRetries,
        totalTokensUsed: this.totalTokensUsed,
        inputTokensUsed: this.inputTokensUsed,
        outputTokensUsed: this.outputTokensUsed,
        durationMs: Date.now() - startMs,
      };
    }
  }

  /**
   * Analyze a task and return an implementation plan without invoking tools,
   * creating checkpoints, installing dependencies, or editing project files.
   */
  async plan(task: string): Promise<{
    plan: string;
    totalTokensUsed: number;
    inputTokensUsed: number;
    outputTokensUsed: number;
    durationMs: number;
  }> {
    const startMs = Date.now();
    this.resetUsage();
    const emit = (event: AgentProgressEvent) => this.options.onProgress(event);

    emit({ phase: "exploring", message: "Analyzing project for a read-only plan..." });
    const graph = this.projectIndexer.generateKnowledgeGraph(false);
    const projectMemory =
      this.memoryManager.getResumeInfo().memoryContent ?? "No project memory recorded.";
    const graphContextStr = `Project Name: ${graph.projectName}\nFrameworks: ${graph.frameworks.join(", ") || "none"}\nLanguages: ${graph.languages.join(", ") || "none"}\nPackage Manager: ${graph.packageManager}\nDatabase: ${graph.databaseType || "none"}\nArchitecture Notes: ${graph.architectureNotes.join("; ") || "standard"}\n\nProject Memory:\n${projectMemory.slice(0, 3000)}`;
    const context = await this.contextEngine.buildContext(task);
    const detectedSkills = this.skillManager.detectSkillsForTask(task);
    const skillInstructions = detectedSkills
      .map(
        (skill) =>
          `[SKILL: ${skill.name}]\nDescription: ${skill.description}\nRecommended Workflow: ${skill.recommendedWorkflow.join(" -> ")}`,
      )
      .join("\n\n");
    const explorationSummary = await this.runExplorer(
      task,
      context,
      graphContextStr,
      skillInstructions,
    );

    emit({ phase: "planning", message: "Creating read-only implementation plan..." });
    const plan = await this.runPlanner(task, context, explorationSummary, skillInstructions);
    emit({ phase: "done", message: "✓ Read-only plan ready", detail: plan });

    return {
      plan,
      totalTokensUsed: this.totalTokensUsed,
      inputTokensUsed: this.inputTokensUsed,
      outputTokensUsed: this.outputTokensUsed,
      durationMs: Date.now() - startMs,
    };
  }

  // ── Sub-agent implementations ──────────────────────────────────────────

  private async runExplorer(
    task: string,
    context: ProjectContext,
    graphContextStr: string,
    skillInstructions: string,
  ): Promise<string> {
    const fileList = context.files
      .slice(0, 20)
      .map((f) => `  ${f.path} (relevance: ${f.relevanceScore.toFixed(1)})`)
      .join("\n");

    const promptText = [
      `Task: ${task}`,
      `Knowledge Graph:\n${graphContextStr}`,
      skillInstructions ? `Skills Guidelines:\n${skillInstructions}` : "",
      `Top relevant files:\n${fileList}`,
      "Provide a concise understanding of the project structure and what files will need to be modified for this task.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { text, usage } = await (generateText as any)({
      model: this.planModel,
      system: EXPLORER_SYSTEM_PROMPT,
      prompt: promptText,
    });
    this.recordUsage(usage);
    return text;
  }

  private async runPlanner(
    task: string,
    context: ProjectContext,
    explorationSummary: string,
    skillInstructions: string,
  ): Promise<string> {
    const contextBlock = context.files
      .slice(0, 5)
      .map(
        (f) =>
          `\`\`\`${getFileExtension(f.path)}\n// ${f.path}\n${f.content.slice(0, 2000)}\n\`\`\``,
      )
      .join("\n\n");

    const promptText = [
      `Task: ${task}`,
      `Project understanding:\n${explorationSummary}`,
      skillInstructions ? `Skills Guidelines:\n${skillInstructions}` : "",
      `Key files:\n${contextBlock}`,
      "Create a numbered, step-by-step implementation plan.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { text, usage } = await (generateText as any)({
      model: this.planModel,
      system: PLANNER_SYSTEM_PROMPT,
      prompt: promptText,
    });
    this.recordUsage(usage);
    return text;
  }

  private async runCoder(
    task: string,
    context: ProjectContext,
    plan: string,
    skillInstructions: string,
  ): Promise<{ filesModified: string[] }> {
    const filesModified: string[] = [];

    const contextBlock = context.files
      .map((f) => `\`\`\`${getFileExtension(f.path)}\n// FILE: ${f.path}\n${f.content}\n\`\`\``)
      .join("\n\n");

    const promptText = [
      `Task: ${task}`,
      `Implementation plan:\n${plan}`,
      skillInstructions ? `Active Skill Guidelines:\n${skillInstructions}` : "",
      `Project files:\n${contextBlock}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { usage } = await (generateText as any)({
      model: this.model,
      system: CODER_SYSTEM_PROMPT,
      tools: this.tools,
      prompt: promptText,
      maxSteps: 15,
      onStepFinish({ toolResults }: any) {
        for (const result of toolResults ?? []) {
          if (["writeFile", "editFile", "deleteFile", "moveFile"].includes(result.toolName)) {
            const path = (result as any)?.result?.path ?? (result as any)?.output?.path;
            if (path && !filesModified.includes(path)) filesModified.push(path);
          }
        }
      },
    });
    this.recordUsage(usage);

    return { filesModified };
  }

  private async runTester(context: ProjectContext): Promise<TestResult> {
    const testCommand = this.detectTestCommand(context);

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

  private detectTestCommand(context: ProjectContext): string | null {
    const pkgJson = context.files.find((file) => file.path === "package.json");
    if (pkgJson) {
      try {
        const pkg = JSON.parse(pkgJson.content) as { scripts?: Record<string, string> };
        const packageManager = this.dependencyManager.planDependencies([]).packageManager;
        const runScript = (script: string) => {
          if (packageManager === "bun") return `bun run ${script}`;
          if (packageManager === "yarn") return `yarn ${script}`;
          if (packageManager === "pnpm") return `pnpm ${script}`;
          return script === "test" ? "npm test" : `npm run ${script}`;
        };
        if (pkg.scripts?.test) return runScript("test");
        if (pkg.scripts?.["test:run"]) return runScript("test:run");
        if (pkg.scripts?.check) return runScript("check");
      } catch {
        // Fall through to ecosystem-based detection.
      }
    }

    const paths = new Set(context.files.map((file) => file.path));
    if (paths.has("pyproject.toml") || paths.has("requirements.txt")) return "python -m pytest";
    if (paths.has("Cargo.toml")) return "cargo test";
    if (paths.has("go.mod")) return "go test ./...";
    return null;
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

    const { usage } = await (generateText as any)({
      model: this.model,
      system: DEBUGGER_SYSTEM_PROMPT,
      tools: this.tools,
      prompt: `Original task: ${task}\n\nOriginal plan:\n${plan}\n\nTest failure output:\n${testResult.output}\n\nProject files:\n${contextBlock}\n\nAnalyze the test failure and fix the root cause.`,
      maxSteps: 10,
      onStepFinish({ toolResults }: any) {
        for (const result of toolResults ?? []) {
          if (["writeFile", "editFile", "deleteFile", "moveFile"].includes(result.toolName)) {
            const path = (result as any)?.result?.path ?? (result as any)?.output?.path;
            if (path && !filesModified.includes(path)) filesModified.push(path);
          }
        }
      },
    });
    this.recordUsage(usage);

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
    this.recordUsage(usage);
    return text;
  }

  private resetUsage(): void {
    this.totalTokensUsed = 0;
    this.inputTokensUsed = 0;
    this.outputTokensUsed = 0;
  }

  private recordUsage(
    usage: { totalTokens?: number; inputTokens?: number; outputTokens?: number } | undefined,
  ): void {
    const input = usage?.inputTokens ?? 0;
    const output = usage?.outputTokens ?? 0;
    this.inputTokensUsed += input;
    this.outputTokensUsed += output;
    this.totalTokensUsed += usage?.totalTokens ?? input + output;
  }
}

// ---------------------------------------------------------------------------
// Safe edit preview
// ---------------------------------------------------------------------------

function cleanListItem(line: string): string {
  return line
    .trim()
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function isLikelyFilePath(value: string, knownFiles: Set<string>): boolean {
  if (knownFiles.has(value)) return true;
  if (value.startsWith("/") || value.includes("..") || /[<>|]/.test(value)) return false;
  return /^(?:[\w@.+-]+\/)*[\w@.+-]+\.[A-Za-z0-9]+$/.test(value);
}

/** Convert the planner's structured response into the exact approval payload shown before edits. */
export function createSafeEditPreview(
  rawPlan: string,
  knownFilePaths: string[] = [],
  verificationCommands: string[] = [],
): SafeEditPreview {
  const knownFiles = new Set(knownFilePaths);
  const lines = rawPlan.split(/\r?\n/);
  const filesHeading = lines.findIndex((line) =>
    /^#{0,3}\s*files to change\s*:?\s*$/i.test(line.trim()),
  );
  const planHeading = lines.findIndex((line) => /^#{0,3}\s*plan\s*:?\s*$/i.test(line.trim()));
  const verificationHeading = lines.findIndex((line) =>
    /^#{0,3}\s*(verification|tests?|commands?)\s*:?\s*$/i.test(line.trim()),
  );

  const fileLines =
    filesHeading >= 0
      ? lines.slice(filesHeading + 1, planHeading > filesHeading ? planHeading : undefined)
      : [];
  const files = fileLines
    .map(cleanListItem)
    .map((line) => line.match(/`([^`]+)`/)?.[1] ?? line.split(/\s+[—–]\s+/)[0]?.trim() ?? "")
    .filter((candidate) => isLikelyFilePath(candidate, knownFiles));

  if (files.length === 0) {
    for (const knownFile of knownFilePaths) {
      if (rawPlan.includes(knownFile)) files.push(knownFile);
    }
    for (const match of rawPlan.matchAll(/`((?:[\w@.+-]+\/)*[\w@.+-]+\.[A-Za-z0-9]+)`/g)) {
      const candidate = match[1];
      if (candidate && isLikelyFilePath(candidate, knownFiles)) files.push(candidate);
    }
  }

  const planEnd = verificationHeading > planHeading ? verificationHeading : lines.length;
  let steps =
    planHeading >= 0
      ? lines
          .slice(planHeading + 1, planEnd)
          .map(cleanListItem)
          .filter(Boolean)
      : lines
          .map(cleanListItem)
          .filter((line) => line.length > 0 && !/^files to change:?$/i.test(line));
  steps = steps.filter((step) => !isLikelyFilePath(step.replace(/`/g, ""), knownFiles));

  return {
    files: [...new Set(files)],
    steps: [...new Set(steps)],
    verificationCommands: [...new Set(verificationCommands.filter(Boolean))],
    rawPlan,
  };
}

export function formatSafeEditPreview(preview: SafeEditPreview): string {
  const files =
    preview.files.length > 0
      ? preview.files.map((file) => `- ${file}`).join("\n")
      : "- No files identified — review carefully before continuing";
  const steps =
    preview.steps.length > 0
      ? preview.steps.map((step) => `- ${step}`).join("\n")
      : "- Implement the requested change";
  const verification =
    preview.verificationCommands.length > 0
      ? preview.verificationCommands.map((command) => `- ${command}`).join("\n")
      : "- No verification command detected";
  return `Files to change:\n${files}\n\nPlan:\n${steps}\n\nVerification:\n${verification}`;
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
Your role is to create a concise, safe implementation preview.
Return exactly these two sections:

Files to change:
- path/to/file.ext

Plan:
- one concrete change
- another concrete change

List every file that may be created, edited, moved, or deleted. Put only a repository-relative path on each file line.
Keep plan steps short, specific, and user-facing.
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
