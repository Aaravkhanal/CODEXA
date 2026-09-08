/**
 * CODEXA — PermissionEngine
 *
 * Classifies command execution into SAFE, MODERATE, or HIGH_RISK,
 * enforcing confirmation guardrails for high-risk operations.
 */

import type { PermissionCheckResult } from "@codexa/shared";

const HIGH_RISK_PATTERNS = [
  /rm\s+-rf?\s/i,
  /del\s+\/[sf]/i,
  /format\s+[a-z]:/i,
  /git\s+push\s+--(?:force|hard)/i,
  /git\s+reset\s+--hard/i,
  /drop\s+(?:database|table|schema)/i,
  /truncate\s+table/i,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  />\s*\/dev\/sd[a-z]/,
  /mkfs\./,
];

const MODERATE_PATTERNS = [
  /\b(?:npm|bun|pnpm|yarn|pip|cargo)\s+(?:install|add|remove|uninstall)\b/i,
  /\bgit\s+(?:checkout|branch|merge|rebase)\b/i,
  /\b(write|create|delete)\s+file\b/i,
];

export class PermissionEngine {
  public evaluateCommand(command: string): PermissionCheckResult {
    const cmd = command.trim();

    for (const pattern of HIGH_RISK_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          command: cmd,
          riskLevel: "HIGH_RISK",
          reason: `Command contains high-risk pattern matching: ${pattern.source}`,
          requiresConfirmation: true,
        };
      }
    }

    for (const pattern of MODERATE_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          command: cmd,
          riskLevel: "MODERATE",
          reason: "Modifies dependencies, git branch state, or project files",
          requiresConfirmation: false,
        };
      }
    }

    return {
      command: cmd,
      riskLevel: "SAFE",
      reason: "Read-only or safe inspection command",
      requiresConfirmation: false,
    };
  }
}
