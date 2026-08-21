declare const CODEXA_VERSION: string | undefined;
declare const CODEXA_OPENTUI_LIBC: string | undefined;

const version = typeof CODEXA_VERSION === "string" ? CODEXA_VERSION : "dev";
const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(`codexa ${version}`);
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`CODEXA ${version}

Usage:
  codexa [options]

Options:
  -h, --help       Show this help message
  -v, --version    Show the installed CODEXA version

Environment:
  API_URL          Override the CODEXA API endpoint`);
} else if (args.length > 0) {
  console.error(`Unknown option: ${args[0]}\nRun 'codexa --help' for usage.`);
  process.exitCode = 1;
} else {
  if (typeof CODEXA_OPENTUI_LIBC === "string" && CODEXA_OPENTUI_LIBC) {
    process.env.OPENTUI_LIBC = CODEXA_OPENTUI_LIBC;
  }
  await import("./app");
}
