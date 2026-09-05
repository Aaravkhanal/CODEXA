/**
 * CODEXA Context Engine
 *
 * Intelligently selects files from a project to include in the agent's
 * context window, prioritizing relevance while respecting token limits.
 *
 * Strategy:
 *   1. Always include structural anchor files (package.json, README, config)
 *   2. Score all other files by relevance to the task description
 *   3. Read files in priority order until the token budget is exhausted
 *   4. Cache file content during a session to avoid repeated reads
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, extname } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default token budget for context (conservative estimate: 1 token ≈ 4 chars) */
const DEFAULT_TOKEN_BUDGET = 80_000;
const CHARS_PER_TOKEN = 4;
const MAX_SINGLE_FILE_TOKENS = 12_000;

/** Directories that are never included in context */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "target",
  "venv",
  "__pycache__",
  ".cache",
  ".parcel-cache",
  ".turbo",
  "out",
  ".svelte-kit",
  "storybook-static",
  ".expo",
  "android",
  "ios",
]);

/** File extensions worth reading for code context */
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".cs", ".cpp", ".c", ".h", ".hpp",
  ".php", ".swift", ".dart",
  ".html", ".css", ".scss", ".less",
  ".json", ".yaml", ".yml", ".toml", ".env.example",
  ".md", ".mdx",
  ".sh", ".bash", ".zsh", ".fish",
  ".sql", ".graphql", ".gql",
  ".proto", ".prisma",
  ".Dockerfile", ".dockerfile",
]);

/** Structural anchor files — always included first */
const ANCHOR_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "composer.json",
  "README.md",
  ".codexa/instructions.md",
  ".codexa/architecture.md",
  ".codexa/config.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.ts",
  "next.config.js",
  ".env.example",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextFile {
  path: string;       // relative path from project root
  content: string;
  tokenEstimate: number;
  relevanceScore: number;
}

export interface ProjectContext {
  files: ContextFile[];
  totalTokensUsed: number;
  tokenBudget: number;
  truncated: boolean;
  fileCount: number;
}

// ---------------------------------------------------------------------------
// Context Engine
// ---------------------------------------------------------------------------

export class ContextEngine {
  private readonly cwd: string;
  private readonly tokenBudget: number;
  private readonly fileCache = new Map<string, string>();

  constructor(cwd: string, tokenBudget = DEFAULT_TOKEN_BUDGET) {
    this.cwd = cwd;
    this.tokenBudget = tokenBudget;
  }

  /**
   * Build context for the given task description.
   * Returns prioritized file content within the token budget.
   */
  async buildContext(taskDescription: string): Promise<ProjectContext> {
    const allFiles = await this.discoverFiles();
    const scored = this.scoreFiles(allFiles, taskDescription);
    return this.assembleContext(scored);
  }

  /**
   * Read a specific file and cache it.
   * Used by agent tools for targeted file access.
   */
  readFile(relativePath: string): string {
    if (this.fileCache.has(relativePath)) {
      return this.fileCache.get(relativePath)!;
    }
    const absolute = join(this.cwd, relativePath);
    if (!existsSync(absolute)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    const content = readFileSync(absolute, "utf-8");
    this.fileCache.set(relativePath, content);
    return content;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async discoverFiles(): Promise<string[]> {
    const files: string[] = [];
    await this.walkDir(this.cwd, files);
    return files;
  }

  private async walkDir(dir: string, files: string[]): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip hidden dirs and excluded dirs
      if (entry.startsWith(".") && entry !== ".codexa") continue;
      if (EXCLUDED_DIRS.has(entry)) continue;

      const fullPath = join(dir, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        await this.walkDir(fullPath, files);
      } else {
        const ext = extname(entry).toLowerCase();
        // No extension check for Dockerfile, Makefile, etc.
        const noExt = !entry.includes(".");
        if (CODE_EXTENSIONS.has(ext) || noExt || CODE_EXTENSIONS.has(entry.toLowerCase())) {
          files.push(relative(this.cwd, fullPath));
        }
      }
    }
  }

  private scoreFiles(files: string[], task: string): Array<{ path: string; score: number }> {
    const taskLower = task.toLowerCase();
    const taskTokens = tokenize(taskLower);

    return files
      .map((file) => ({
        path: file,
        score: this.scoreFile(file, taskTokens),
      }))
      .sort((a, b) => b.score - a.score);
  }

  private scoreFile(relativePath: string, taskTokens: string[]): number {
    let score = 0;
    const pathLower = relativePath.toLowerCase();

    // Anchor files get high base priority
    const basename = relativePath.split("/").pop()!;
    if (ANCHOR_FILES.includes(basename) || ANCHOR_FILES.includes(relativePath)) {
      score += 100;
    }

    // Score by path relevance to task tokens
    for (const token of taskTokens) {
      if (pathLower.includes(token)) {
        score += 10;
      }
    }

    // src/ files are generally more relevant than config files
    if (pathLower.startsWith("src/") || pathLower.startsWith("lib/")) score += 5;

    // TypeScript/main source files preferred
    if (pathLower.endsWith(".ts") || pathLower.endsWith(".tsx")) score += 3;
    if (pathLower.endsWith(".py")) score += 3;

    // Test files deprioritized unless task mentions "test"
    if (pathLower.includes(".test.") || pathLower.includes(".spec.")) {
      if (!taskTokens.some((t) => t.includes("test") || t.includes("spec"))) {
        score -= 5;
      }
    }

    // Deeply nested files slightly deprioritized
    const depth = relativePath.split("/").length;
    score -= depth * 0.5;

    return score;
  }

  private assembleContext(
    scored: Array<{ path: string; score: number }>,
  ): ProjectContext {
    const result: ContextFile[] = [];
    let tokensUsed = 0;
    let truncated = false;

    for (const { path, score } of scored) {
      if (tokensUsed >= this.tokenBudget) {
        truncated = true;
        break;
      }

      const absolute = join(this.cwd, path);
      let content: string;
      try {
        content = readFileSync(absolute, "utf-8");
      } catch {
        continue;
      }

      // Skip binary-looking files
      if (looksLikeBinary(content)) continue;

      // Truncate very large files
      const maxChars = MAX_SINGLE_FILE_TOKENS * CHARS_PER_TOKEN;
      if (content.length > maxChars) {
        content = content.slice(0, maxChars) + "\n... [truncated]";
      }

      const tokenEstimate = Math.ceil(content.length / CHARS_PER_TOKEN);
      const remaining = this.tokenBudget - tokensUsed;

      if (tokenEstimate > remaining) {
        // Try to fit a truncated version
        const truncatedContent = content.slice(0, remaining * CHARS_PER_TOKEN);
        if (truncatedContent.length < 100) continue; // Too small to be useful

        result.push({
          path,
          content: truncatedContent + "\n... [context budget exhausted]",
          tokenEstimate: remaining,
          relevanceScore: score,
        });
        tokensUsed += remaining;
        truncated = true;
        break;
      }

      this.fileCache.set(path, content);
      result.push({ path, content, tokenEstimate, relevanceScore: score });
      tokensUsed += tokenEstimate;
    }

    return {
      files: result,
      totalTokensUsed: tokensUsed,
      tokenBudget: this.tokenBudget,
      truncated,
      fileCount: scored.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .split(/\W+/)
    .filter((t) => t.length > 2)
    .map((t) => t.toLowerCase());
}

function looksLikeBinary(content: string): boolean {
  // Check first 512 bytes for null bytes or high concentration of non-printable chars
  const sample = content.slice(0, 512);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return true; // Null byte = definitely binary
    if (code < 9 || (code > 13 && code < 32)) nonPrintable++;
  }
  return nonPrintable / sample.length > 0.1;
}
