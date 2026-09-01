const args = process.argv.slice(2);

export type CliMode =
  | "interactive"
  | "setup"
  | "status"
  | "review"
  | "explain"
  | "plan"
  | "scan"
  | "commit"
  | "task";

export interface ParsedArgs {
  mode: CliMode;
  targetFile?: string;
  taskPrompt?: string;
  autoApprove: boolean;
  model?: string;
  executionMode?: "PLAN" | "BUILD";
}

export function parseCliArgs(argv: string[] = args): ParsedArgs {
  let autoApprove = false;
  let model: string | undefined;
  let executionMode: "PLAN" | "BUILD" | undefined;
  let isStatus = false;
  const filteredArgs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-y" || arg === "--yes" || arg === "--auto-approve" || arg === "--dangerously-skip-permissions") {
      autoApprove = true;
    } else if (arg === "--status") {
      isStatus = true;
    } else if (arg === "--model" && argv[i + 1]) {
      model = argv[++i];
    } else if (arg === "--mode" && argv[i + 1]) {
      const m = argv[++i]?.toUpperCase();
      if (m === "PLAN" || m === "BUILD") executionMode = m;
    } else if (!arg.startsWith("-")) {
      filteredArgs.push(arg);
    }
  }

  if (isStatus) {
    return { mode: "status", autoApprove, model, executionMode };
  }

  if (filteredArgs.length === 0) {
    return { mode: "interactive", autoApprove, model, executionMode };
  }

  const first = filteredArgs[0]!;

  if (first === "setup") return { mode: "setup", autoApprove, model, executionMode };
  if (first === "review") return { mode: "review", autoApprove, model, executionMode };
  if (first === "scan") return { mode: "scan", autoApprove, model, executionMode };
  if (first === "commit") return { mode: "commit", autoApprove, model, executionMode };
  if (first === "explain") {
    return { mode: "explain", targetFile: filteredArgs[1], autoApprove, model, executionMode };
  }
  if (first === "plan") {
    return { mode: "plan", taskPrompt: filteredArgs.slice(1).join(" "), autoApprove, model, executionMode: "PLAN" };
  }

  // Any positional argument string is treated as a direct task prompt
  return { mode: "task", taskPrompt: filteredArgs.join(" "), autoApprove, model, executionMode };
}

export const cliArgs = parseCliArgs();
export default cliArgs;
