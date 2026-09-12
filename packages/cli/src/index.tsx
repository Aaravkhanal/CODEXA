declare const CODEXA_VERSION: string | undefined;
declare const CODEXA_OPENTUI_LIBC: string | undefined;

import { cliArgs } from "./lib/cli-args";
import { detectProject } from "./lib/project-detector";
import { printDoctorReport } from "./lib/doctor";
import { exportSessionTimeline } from "./lib/lens-export";
import { runSetupWizard } from "./lib/setup-wizard";
import { runConfigCommand } from "./lib/config-cmd";
import { runInitCommand } from "./lib/init-cmd";
import { runSkillCommand } from "./lib/skill-cmd";
import { runRepoCommand } from "./lib/repo-cmd";
import { runImportCommand } from "./lib/import-cmd";
import { runCheckpointCommand } from "./lib/checkpoint-cmd";
import { isFirstRun, migrateFromLegacyApiKeys } from "./lib/global-config";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const version = typeof CODEXA_VERSION === "string" ? CODEXA_VERSION : "dev";
const args = process.argv.slice(2);

// ── Target directory override (--cwd / -C) ──────────────────────────────────
if (cliArgs.cwdArg) {
  const targetCwd = resolve(process.cwd(), cliArgs.cwdArg);
  if (!existsSync(targetCwd)) {
    console.error(`Error: Specified working directory does not exist: ${targetCwd}`);
    process.exit(1);
  }
  process.chdir(targetCwd);
}

// ── Version / Help (always available, no config needed) ───────────────────
if (args.includes("--version") || args.includes("-v")) {
  console.log(`codexa ${version}`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`CODEXA ${version}

Usage:
  codexa [options]
  codexa skill [list|install|create|remove]  Manage reusable agent capabilities (Skills)
  codexa repo [analyze|clone|fork] <url>    Analyze, clone, or fork GitHub repositories
  codexa import <file|folder>                Import external files/folders into project
  codexa checkpoints [list|rollback]         Manage pre-task safety checkpoints
  codexa doctor                              Run diagnostic checks on environment, keys, and MCP config
  codexa config                              Interactive AI provider & model configuration
  codexa init                                Initialize project-specific CODEXA configuration
  codexa setup                               Re-run first-time setup wizard
  codexa lens export [path]                  Export completed session Timeline to HTML report
  codexa commit                              Analyze git status/diff and generate commit
  codexa plan "<prompt>"                     Create step-by-step implementation plan (PLAN mode)
  codexa "<prompt>"                          Execute task prompt directly in terminal

Options:
  -h, --help               Show this help message
  -v, --version            Show the installed CODEXA version
  -y, --auto-approve       Auto-approve tool execution (non-interactive mode)
  --doctor                 Run system diagnostic checks and exit
  --model <name>           Specify model (e.g. claude-opus-4-6, gpt-4o, gemini-2.5-pro)
  --profile <name>         Use a named configuration profile
  --mode <PLAN|BUILD>      Execution mode (PLAN read-only vs BUILD write mode)
  --status                 Print project detection information and exit`);
  process.exit(0);
}

// ── One-time migration from legacy api-keys.json ──────────────────────────
try {
  migrateFromLegacyApiKeys();
} catch {
  // Non-fatal
}

// ── Pure-terminal commands (no OpenTUI needed) ────────────────────────────

if (cliArgs.mode === "skill") {
  await runSkillCommand(cliArgs.subcommand, cliArgs.subArgs);
  process.exit(0);
}

if (cliArgs.mode === "repo") {
  await runRepoCommand(cliArgs.subcommand, cliArgs.subArgs);
  process.exit(0);
}

if (cliArgs.mode === "import") {
  await runImportCommand(cliArgs.targetFile, cliArgs.subArgs);
  process.exit(0);
}

if (cliArgs.mode === "checkpoints") {
  await runCheckpointCommand(cliArgs.subcommand, cliArgs.subArgs);
  process.exit(0);
}

if (cliArgs.mode === "lens-export") {
  const outputPath = cliArgs.exportOutputPath || "codexa-timeline-export.html";
  console.log(`Exporting CodexaLens session timeline report...`);
  const path = await exportSessionTimeline("latest-session", outputPath, []);
  console.log(`✓ HTML Session Report exported successfully to: ${path}`);
  process.exit(0);
}

if (cliArgs.mode === "doctor") {
  const success = await printDoctorReport();
  process.exit(success ? 0 : 1);
}

if (cliArgs.mode === "status") {
  const info = detectProject();
  console.log(`Project: ${info.name}`);
  console.log(`Path: ${info.path}`);
  console.log(`Languages: ${info.languages.join(", ")}`);
  console.log(`Frameworks: ${info.frameworks.join(", ")}`);
  console.log(`Package Manager: ${info.packageManager}`);
  console.log(`Test Framework: ${info.testFramework}`);
  console.log(`Git Status: ${info.gitStatus}`);
  console.log(`Files: ${info.fileCount}`);
  process.exit(0);
}

if (cliArgs.mode === "config") {
  await runConfigCommand(cliArgs.configSubcommand);
  process.exit(0);
}

if (cliArgs.mode === "init") {
  await runInitCommand();
  process.exit(0);
}

if (cliArgs.mode === "setup") {
  await runSetupWizard(true);
  process.exit(0);
}

// ── First-run check: setup wizard before TUI ─────────────────────────────
if (isFirstRun() && cliArgs.mode !== "commit") {
  const configured = await runSetupWizard(false);
  if (!configured) {
    console.error("\nSetup cancelled. Run 'codexa config' to configure CODEXA.\n");
    process.exit(1);
  }
}

// ── OpenTUI / TUI commands ────────────────────────────────────────────────
if (typeof CODEXA_OPENTUI_LIBC === "string" && CODEXA_OPENTUI_LIBC) {
  process.env.OPENTUI_LIBC = CODEXA_OPENTUI_LIBC;
}

if (cliArgs.mode === "commit") {
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    if (!status) {
      console.log("No uncommitted changes found in Git repository.");
      process.exit(0);
    } else {
      console.log("Uncommitted changes detected:\n" + status);
      console.log("\nStaging files and launching CODEXA session to generate commit...");
      await import("./app");
    }
  } catch (err: any) {
    console.error("Git commit command failed:", err.message);
    process.exit(1);
  }
} else {
  await import("./app");
}
