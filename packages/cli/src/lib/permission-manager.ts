import { Mode, type ModeType } from "@codexa/shared";

export type PermissionLevel = "safe" | "moderate" | "dangerous";
export type ApprovalAction = "always_allow" | "ask" | "deny";

export interface CommandPolicyRule {
  toolName?: string;
  pattern?: string;
  action: ApprovalAction;
}

const SAFE_TOOLS = new Set([
  "readFile",
  "listDirectory",
  "glob",
  "grep",
  "gitStatus",
  "gitDiff",
  "gitLog",
]);

const WRITE_TOOLS = new Set([
  "writeFile",
  "editFile",
  "deleteFile",
  "moveFile",
  "bash",
  "gitCommit",
]);

const DEFAULT_POLICY_RULES: CommandPolicyRule[] = [
  { toolName: "readFile", action: "always_allow" },
  { toolName: "listDirectory", action: "always_allow" },
  { toolName: "glob", action: "always_allow" },
  { toolName: "grep", action: "always_allow" },
  { toolName: "gitStatus", action: "always_allow" },
  { toolName: "gitDiff", action: "always_allow" },
  { toolName: "gitLog", action: "always_allow" },
  { pattern: "^git\\s+(?:status|diff|log|branch)", action: "always_allow" },
  { pattern: "^(?:rm|del|format|destroy)\\s+-rf", action: "deny" },
];

export function evaluateCommandPermission(
  toolName: string,
  input: any,
  mode: ModeType = Mode.BUILD,
  customRules: CommandPolicyRule[] = [],
): ApprovalAction {
  // Fail-closed rule: PLAN mode unconditionally denies write tools
  if (mode === Mode.PLAN && WRITE_TOOLS.has(toolName)) {
    return "deny";
  }

  const allRules = [...customRules, ...DEFAULT_POLICY_RULES];
  const commandStr = typeof input === "object" && input !== null ? String(input.command || input.path || "") : String(input || "");

  for (const rule of allRules) {
    if (rule.toolName && rule.toolName === toolName) {
      return rule.action;
    }
    if (rule.pattern && commandStr) {
      try {
        const regex = new RegExp(rule.pattern, "i");
        if (regex.test(commandStr)) {
          return rule.action;
        }
      } catch {
        // invalid regex rule ignored
      }
    }
  }

  // Fail-closed fallback: unlisted tools or commands require confirmation
  return "ask";
}

export function getPermissionLevel(toolName: string, input: any): PermissionLevel {
  if (SAFE_TOOLS.has(toolName)) {
    return "safe";
  }
  if (toolName === "deleteFile" || toolName === "gitCommit") {
    return "dangerous";
  }
  if (toolName === "bash") {
    const command = String(input?.command || "");
    const isDestructive = /\b(?:rm|del|drop|format|destroy|reset)\b/i.test(command);
    return isDestructive ? "dangerous" : "moderate";
  }
  return "moderate";
}

export function shouldAutoApproveTool(
  toolName: string,
  input: any,
  globalAutoApprove: boolean = false,
  mode: ModeType = Mode.BUILD,
): boolean {
  if (mode === Mode.PLAN && WRITE_TOOLS.has(toolName)) {
    return false; // Never auto approve write tools in PLAN mode
  }
  if (globalAutoApprove) return true;

  const action = evaluateCommandPermission(toolName, input, mode);
  if (action === "always_allow") return true;
  if (action === "deny") return false;

  return SAFE_TOOLS.has(toolName);
}
