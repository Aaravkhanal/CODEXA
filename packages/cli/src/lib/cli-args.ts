const args = process.argv.slice(2);

export type CliMode =
  | "interactive"
  | "setup"
  | "config"
  | "init"
  | "status"
  | "doctor"
  | "review"
  | "explain"
  | "plan"
  | "scan"
  | "commit"
  | "lens-export"
  | "task";

export interface ParsedArgs {
  mode: CliMode;
  targetFile?: string;
  taskPrompt?: string;
  autoApprove: boolean;
  sandbox: boolean;
  model?: string;
  profile?: string;
  executionMode?: "PLAN" | "BUILD";
  exportOutputPath?: string;
  /** Sub-command for `codexa config <subcommand>` e.g. "provider", "model", "reset" */
  configSubcommand?: string;
}

export function parseCliArgs(argv: string[] = args): ParsedArgs {
  let autoApprove = false;
  let sandbox = false;
  let model: string | undefined;
  let profile: string | undefined;
  let executionMode: "PLAN" | "BUILD" | undefined;
  let isStatus = false;
  let isDoctor = false;
  const filteredArgs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-y" || arg === "--yes" || arg === "--auto-approve" || arg === "--dangerously-skip-permissions") {
      autoApprove = true;
    } else if (arg === "--sandbox") {
      sandbox = true;
    } else if (arg === "--status") {
      isStatus = true;
    } else if (arg === "--doctor" || arg === "doctor") {
      isDoctor = true;
    } else if (arg === "--model" && argv[i + 1]) {
      model = argv[++i];
    } else if ((arg === "--profile" || arg === "-p") && argv[i + 1]) {
      profile = argv[++i];
    } else if (arg === "--mode" && argv[i + 1]) {
      const m = argv[++i]?.toUpperCase();
      if (m === "PLAN" || m === "BUILD") executionMode = m;
    } else if (!arg.startsWith("-")) {
      filteredArgs.push(arg);
    }
  }

  if (isDoctor) {
    return { mode: "doctor", autoApprove, sandbox, model, profile, executionMode };
  }

  if (isStatus) {
    return { mode: "status", autoApprove, sandbox, model, profile, executionMode };
  }

  if (filteredArgs.length === 0) {
    return { mode: "interactive", autoApprove, sandbox, model, profile, executionMode };
  }

  const first = filteredArgs[0]!;
  const second = filteredArgs[1];

  if (first === "setup") return { mode: "setup", autoApprove, sandbox, model, profile, executionMode };
  if (first === "doctor") return { mode: "doctor", autoApprove, sandbox, model, profile, executionMode };
  if (first === "review") return { mode: "review", autoApprove, sandbox, model, profile, executionMode };
  if (first === "scan") return { mode: "scan", autoApprove, sandbox, model, profile, executionMode };
  if (first === "commit") return { mode: "commit", autoApprove, sandbox, model, profile, executionMode };
  if (first === "init") return { mode: "init", autoApprove, sandbox, model, profile, executionMode };
  if (first === "config") {
    // `codexa config [provider|model|reset]`
    const configSubcommand = second && ["provider", "model", "reset"].includes(second) ? second : undefined;
    return { mode: "config", configSubcommand, autoApprove, sandbox, model, profile, executionMode };
  }
  if (first === "lens" && second === "export") {
    return {
      mode: "lens-export",
      exportOutputPath: filteredArgs[2] || "codexa-timeline-export.html",
      autoApprove,
      sandbox,
      model,
      profile,
      executionMode,
    };
  }
  if (first === "explain") {
    return { mode: "explain", targetFile: filteredArgs[1], autoApprove, sandbox, model, profile, executionMode };
  }
  if (first === "plan") {
    return { mode: "plan", taskPrompt: filteredArgs.slice(1).join(" "), autoApprove, sandbox, model, profile, executionMode: "PLAN" };
  }

  // Any positional argument string is treated as a direct task prompt
  return { mode: "task", taskPrompt: filteredArgs.join(" "), autoApprove, sandbox, model, profile, executionMode };
}

export const cliArgs = parseCliArgs();
export default cliArgs;
