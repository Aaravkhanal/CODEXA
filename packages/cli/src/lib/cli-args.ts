const args = process.argv.slice(2);

export type CliMode = "interactive" | "setup" | "status" | "review" | "explain" | "plan" | "scan" | "task";

export interface ParsedArgs {
  mode: CliMode;
  targetFile?: string;
  taskPrompt?: string;
}

export function parseCliArgs(argv: string[] = args): ParsedArgs {
  if (argv.length === 0) return { mode: "interactive" };

  const first = argv[0]!;

  if (first === "setup") return { mode: "setup" };
  if (first === "--status") return { mode: "status" };
  if (first === "review") return { mode: "review" };
  if (first === "scan") return { mode: "scan" };
  if (first === "explain") {
    return { mode: "explain", targetFile: argv[1] };
  }
  if (first === "plan") {
    return { mode: "plan", taskPrompt: argv[1] };
  }

  // Any other single string argument is treated as a direct task prompt
  return { mode: "task", taskPrompt: first };
}

export const cliArgs = parseCliArgs();
export default cliArgs;
