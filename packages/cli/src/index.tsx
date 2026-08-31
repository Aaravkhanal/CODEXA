declare const CODEXA_VERSION: string | undefined;
declare const CODEXA_OPENTUI_LIBC: string | undefined;

import { cliArgs } from "./lib/cli-args";
import { detectProject } from "./lib/project-detector";

const version = typeof CODEXA_VERSION === "string" ? CODEXA_VERSION : "dev";
const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(`codexa ${version}`);
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`CODEXA ${version}

Usage:
  codexa [options]
  codexa setup
  codexa review
  codexa scan
  codexa explain <file>
  codexa plan "<prompt>"
  codexa "<prompt>"

Options:
  -h, --help       Show this help message
  -v, --version    Show the installed CODEXA version
  --status         Print project detection information and exit

Environment:
  API_URL          Override the CODEXA API endpoint`);
} else if (args.includes("--status")) {
  const info = detectProject();
  console.log(`Project: ${info.name}`);
  console.log(`Path: ${info.path}`);
  console.log(`Languages: ${info.languages.join(", ")}`);
  console.log(`Frameworks: ${info.frameworks.join(", ")}`);
  console.log(`Package Manager: ${info.packageManager}`);
  console.log(`Test Framework: ${info.testFramework}`);
  console.log(`Git Status: ${info.gitStatus}`);
  console.log(`Files: ${info.fileCount}`);
} else {
  if (typeof CODEXA_OPENTUI_LIBC === "string" && CODEXA_OPENTUI_LIBC) {
    process.env.OPENTUI_LIBC = CODEXA_OPENTUI_LIBC;
  }
  await import("./app");
}
