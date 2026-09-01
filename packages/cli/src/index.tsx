declare const CODEXA_VERSION: string | undefined;
declare const CODEXA_OPENTUI_LIBC: string | undefined;

import { cliArgs } from "./lib/cli-args";
import { detectProject } from "./lib/project-detector";
import { printDoctorReport } from "./lib/doctor";
import { exportSessionTimeline } from "./lib/lens-export";
import { execSync } from "node:child_process";

const version = typeof CODEXA_VERSION === "string" ? CODEXA_VERSION : "dev";
const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(`codexa ${version}`);
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`CODEXA ${version}

Usage:
  codexa [options]
  codexa doctor               Run diagnostic checks on environment, keys, and MCP config
  codexa lens export [path]   Export completed session Timeline to standalone HTML report
  codexa commit               Analyze git status/diff and generate commit
  codexa setup                Interactive auth & API keys setup
  codexa review               Review uncommitted git changes for potential bugs
  codexa scan                 Scan project structure and index CodexaLens graph
  codexa explain <file>       Explain source code file structure
  codexa plan "<prompt>"      Create step-by-step implementation plan (PLAN mode)
  codexa "<prompt>"           Execute task prompt directly in terminal

Options:
  -h, --help               Show this help message
  -v, --version            Show the installed CODEXA version
  -y, --auto-approve       Auto-approve tool execution (non-interactive mode)
  --doctor                 Run system diagnostic checks and exit
  --model <name>           Specify model (e.g. claude-3-5-sonnet, gpt-4o, gemini-2.5-flash)
  --mode <PLAN|BUILD>      Execution mode (PLAN read-only vs BUILD write mode)
  --status                 Print project detection information and exit

Environment:
  API_URL                  Override the CODEXA API endpoint
  ANTHROPIC_API_KEY        Anthropic API key for direct local LLM execution
  OPENAI_API_KEY           OpenAI API key for direct local LLM execution
  GOOGLE_API_KEY           Google Gemini API key for direct local LLM execution`);
} else if (cliArgs.mode === "lens-export") {
  const outputPath = cliArgs.exportOutputPath || "codexa-timeline-export.html";
  console.log(`Exporting CodexaLens session timeline report...`);
  const path = await exportSessionTimeline("latest-session", outputPath, []);
  console.log(`✓ HTML Session Report exported successfully to: ${path}`);
  process.exit(0);
} else if (cliArgs.mode === "doctor") {
  const success = await printDoctorReport();
  process.exit(success ? 0 : 1);
} else if (cliArgs.mode === "status") {
  const info = detectProject();
  console.log(`Project: ${info.name}`);
  console.log(`Path: ${info.path}`);
  console.log(`Languages: ${info.languages.join(", ")}`);
  console.log(`Frameworks: ${info.frameworks.join(", ")}`);
  console.log(`Package Manager: ${info.packageManager}`);
  console.log(`Test Framework: ${info.testFramework}`);
  console.log(`Git Status: ${info.gitStatus}`);
  console.log(`Files: ${info.fileCount}`);
} else if (cliArgs.mode === "commit") {
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    if (!status) {
      console.log("No uncommitted changes found in Git repository.");
    } else {
      console.log("Uncommitted changes detected:\n" + status);
      console.log("\nStaging files and launching CODEXA session to generate commit...");
      if (typeof CODEXA_OPENTUI_LIBC === "string" && CODEXA_OPENTUI_LIBC) {
        process.env.OPENTUI_LIBC = CODEXA_OPENTUI_LIBC;
      }
      await import("./app");
    }
  } catch (err: any) {
    console.error("Git commit command failed:", err.message);
  }
} else {
  if (typeof CODEXA_OPENTUI_LIBC === "string" && CODEXA_OPENTUI_LIBC) {
    process.env.OPENTUI_LIBC = CODEXA_OPENTUI_LIBC;
  }
  await import("./app");
}
