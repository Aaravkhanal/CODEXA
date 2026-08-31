import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function getProjectRules(cwd: string = process.cwd()): string {
  const rulesFiles = ["CODEXA.md", "AGENTS.md", "CLAUDE.md", ".cursorrules"];

  for (const filename of rulesFiles) {
    const filePath = join(cwd, filename);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        return content.trim();
      } catch {
        // Ignored
      }
    }
  }

  return "";
}
