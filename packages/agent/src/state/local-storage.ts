import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_RUNTIME_PATTERNS = [
  ".codexa/memory.md",
  ".codexa/sessions/",
  ".codexa/summaries/",
  ".codexa/checkpoints/",
  ".codexa/state/",
];

/** Keep machine-local CODEXA task state out of Git without modifying shared project files. */
export function ensureCodexaRuntimeIgnored(cwd: string): void {
  const excludeFile = join(cwd, ".git", "info", "exclude");
  if (!existsSync(excludeFile)) return;

  try {
    const existing = readFileSync(excludeFile, "utf-8");
    const missing = LOCAL_RUNTIME_PATTERNS.filter(
      (pattern) => !existing.split(/\r?\n/).some((line) => line.trim() === pattern),
    );
    if (missing.length === 0) return;
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    appendFileSync(
      excludeFile,
      `${prefix}# CODEXA local task state\n${missing.join("\n")}\n`,
      "utf-8",
    );
  } catch {
    // History persistence must still work in read-only or unusual Git installations.
  }
}
