export type PermissionLevel = "safe" | "moderate" | "dangerous";

const SAFE_TOOLS = new Set([
  "readFile",
  "listDirectory",
  "glob",
  "grep",
  "gitStatus",
  "gitDiff",
  "gitLog"
]);

const MODERATE_TOOLS = new Set([
  "writeFile",
  "editFile",
  "moveFile"
]);

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\b/i,
  /\bdel\b/i,
  /\bdrop\b/i,
  /--force\b/i,
  /-rf\b/i,
  /\bformat\b/i,
  /\bdestroy\b/i,
  /\breset\b/i,
];

export function getPermissionLevel(toolName: string, input: any): PermissionLevel {
  if (SAFE_TOOLS.has(toolName)) {
    return "safe";
  }

  if (toolName === "deleteFile" || toolName === "gitCommit") {
    return "dangerous";
  }

  if (toolName === "bash") {
    const command = String(input?.command || "");
    // Check if command matches any destructive patterns
    const isDestructive = DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
    return isDestructive ? "dangerous" : "moderate";
  }

  if (MODERATE_TOOLS.has(toolName)) {
    return "moderate";
  }

  // Fallback default: anything else is considered dangerous to execute
  return "dangerous";
}
