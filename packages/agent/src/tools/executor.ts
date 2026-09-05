/**
 * CODEXA Agent Tool Executor
 *
 * Wraps the tool implementations with:
 *   - Dangerous command detection and confirmation
 *   - Cross-platform command execution (bash on Unix, PowerShell on Windows)
 *   - Path sandboxing (tools cannot escape the project directory)
 *   - Result normalization
 *
 * Tools are exposed as AI SDK `tool()` objects so they can be passed directly
 * to `generateText` / `streamText`.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
  unlink,
  rename,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 50_000; // chars
const MAX_OUTPUT = 50_000;
const DEFAULT_TIMEOUT = 60_000;
const IS_WINDOWS = process.platform === "win32";

const DANGEROUS_COMMAND_PATTERNS = [
  /rm\s+-rf?\s/i,
  /del\s+\/[sf]/i,
  /format\s+[a-z]:/i,
  /git\s+push\s+--force/i,
  /git\s+reset\s+--hard/i,
  /drop\s+(?:database|table|schema)/i,
  /truncate\s+table/i,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  />\s*\/dev\/sd[a-z]/,
  /mkfs\./,
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentToolsOptions {
  cwd: string;
  autoApprove?: boolean;
  onConfirmDangerous?: (command: string, description: string) => Promise<boolean>;
}

export type AgentTools = ReturnType<typeof createAgentTools>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveInsideCwd(cwd: string, path: string) {
  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path "${path}" is outside the project directory`);
  }
  return resolved;
}

function truncate(value: string, limit: number) {
  return value.length > limit
    ? `${value.slice(0, limit)}\n... (truncated, ${value.length} total chars)`
    : value;
}

function isDangerous(command: string): boolean {
  return DANGEROUS_COMMAND_PATTERNS.some((p) => p.test(command));
}

function spawnShell(command: string, cwd: string) {
  if (IS_WINDOWS) {
    return Bun.spawn(
      ["powershell.exe", "-NonInteractive", "-NoProfile", "-Command", command],
      { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, TERM: "dumb" } },
    );
  }
  return Bun.spawn(["bash", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, TERM: "dumb" },
  });
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createAgentTools(options: AgentToolsOptions) {
  const { cwd, autoApprove = false, onConfirmDangerous = async () => false } = options;

  return {
    // ── Read-only tools ────────────────────────────────────────────────────

    readFile: tool({
      description: "Read the contents of a file in the project",
      inputSchema: z.object({
        path: z.string().describe("Relative path to the file"),
      }),
      execute: async ({ path }) => {
        const resolved = resolveInsideCwd(cwd, path);
        const content = await readFile(resolved, "utf-8");
        if (content.length > MAX_FILE_SIZE) {
          return {
            content: content.slice(0, MAX_FILE_SIZE),
            truncated: true,
            totalLength: content.length,
          };
        }
        return { content };
      },
    }),

    listDirectory: tool({
      description: "List files and directories in the project",
      inputSchema: z.object({
        path: z.string().default(".").describe("Relative directory path"),
      }),
      execute: async ({ path }) => {
        const resolved = resolveInsideCwd(cwd, path);
        const entries = await readdir(resolved);
        const results: { name: string; type: "file" | "directory" }[] = [];
        for (const entry of entries) {
          if (entry.startsWith(".") && entry !== ".codexa") continue;
          if (entry === "node_modules") continue;
          const info = await stat(join(resolved, entry));
          results.push({ name: entry, type: info.isDirectory() ? "directory" : "file" });
        }
        results.sort((a, b) =>
          a.type !== b.type ? (a.type === "directory" ? -1 : 1) : a.name.localeCompare(b.name),
        );
        return { path: relative(cwd, resolved) || ".", entries: results };
      },
    }),

    glob: tool({
      description: "Find files matching a glob pattern",
      inputSchema: z.object({
        pattern: z.string().describe("Glob pattern"),
        path: z.string().default(".").describe("Directory to search from"),
      }),
      execute: async ({ pattern, path }) => {
        const resolved = resolveInsideCwd(cwd, path);
        const glob = new Bun.Glob(pattern);
        const files: string[] = [];
        for await (const match of glob.scan({ cwd: resolved, dot: false, onlyFiles: true })) {
          if (match.includes("node_modules")) continue;
          files.push(relative(cwd, resolve(resolved, match)).replaceAll("\\", "/"));
          if (files.length >= 200) break;
        }
        return { files: files.sort() };
      },
    }),

    grep: tool({
      description: "Search for a regex pattern across project files",
      inputSchema: z.object({
        pattern: z.string().describe("Regex pattern to search for"),
        path: z.string().default(".").describe("Directory to search from"),
        include: z.string().optional().describe("File glob filter (e.g. '*.ts')"),
      }),
      execute: async ({ pattern, path, include }) => {
        const resolved = resolveInsideCwd(cwd, path);
        const args = ["-rn", "--color=never", "--exclude-dir=node_modules", "--exclude-dir=.git", "-E"];
        if (include) args.push(`--include=${include}`);
        args.push(pattern, resolved);

        const proc = Bun.spawn(["grep", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
        const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
        const lines = stdout.split("\n").filter(Boolean).slice(0, 50);
        const matches = lines
          .map((line) => {
            const m = line.match(/^(.+?):(\d+):(.*)$/);
            if (!m || !m[1] || !m[2] || !m[3]) return null;
            return { file: relative(cwd, m[1]).replaceAll("\\", "/"), line: Number(m[2]), content: m[3] };
          })
          .filter((item): item is { file: string; line: number; content: string } => item !== null);
        return { matches };
      },
    }),

    // ── Write tools ────────────────────────────────────────────────────────

    writeFile: tool({
      description: "Create or overwrite a file in the project",
      inputSchema: z.object({
        path: z.string().describe("Relative path to write"),
        content: z.string().describe("File contents"),
      }),
      execute: async ({ path, content }) => {
        const resolved = resolveInsideCwd(cwd, path);
        await mkdir(dirname(resolved), { recursive: true });
        await writeFile(resolved, content, "utf-8");
        return {
          success: true as const,
          path: relative(cwd, resolved).replaceAll("\\", "/"),
          bytesWritten: Buffer.byteLength(content, "utf-8"),
        };
      },
    }),

    editFile: tool({
      description: "Replace one unique text occurrence in a file",
      inputSchema: z.object({
        path: z.string().describe("Relative path"),
        oldString: z.string().describe("Exact text to replace; must appear exactly once"),
        newString: z.string().describe("Replacement text"),
      }),
      execute: async ({ path, oldString, newString }) => {
        const resolved = resolveInsideCwd(cwd, path);
        const content = await readFile(resolved, "utf-8");
        const occurrences = content.split(oldString).length - 1;
        if (occurrences === 0) throw new Error(`oldString not found in ${path}`);
        if (occurrences > 1)
          throw new Error(`oldString is ambiguous — found ${occurrences} matches in ${path}`);
        await writeFile(resolved, content.replace(oldString, newString), "utf-8");
        return { success: true as const, path: relative(cwd, resolved).replaceAll("\\", "/") };
      },
    }),

    deleteFile: tool({
      description: "Delete a file from the project",
      inputSchema: z.object({
        path: z.string().describe("Relative path of the file to delete"),
      }),
      execute: async ({ path }) => {
        const resolved = resolveInsideCwd(cwd, path);
        if (!existsSync(resolved)) throw new Error(`File not found: ${path}`);
        await unlink(resolved);
        return { success: true as const, path: relative(cwd, resolved).replaceAll("\\", "/") };
      },
    }),

    moveFile: tool({
      description: "Move or rename a file",
      inputSchema: z.object({
        from: z.string().describe("Source path"),
        to: z.string().describe("Destination path"),
      }),
      execute: async ({ from, to }) => {
        const resolvedFrom = resolveInsideCwd(cwd, from);
        const resolvedTo = resolveInsideCwd(cwd, to);
        if (!existsSync(resolvedFrom)) throw new Error(`Source not found: ${from}`);
        await mkdir(dirname(resolvedTo), { recursive: true });
        await rename(resolvedFrom, resolvedTo);
        return {
          success: true as const,
          from: relative(cwd, resolvedFrom).replaceAll("\\", "/"),
          to: relative(cwd, resolvedTo).replaceAll("\\", "/"),
        };
      },
    }),

    bash: tool({
      description: "Run a shell command in the project directory",
      inputSchema: z.object({
        command: z.string().describe("Shell command to execute"),
        description: z.string().optional().describe("Human-readable description of what this does"),
        timeout: z.number().optional().describe("Timeout in ms (default: 60000)"),
      }),
      execute: async ({ command, description = "", timeout = DEFAULT_TIMEOUT }) => {
        // Safety check: confirm dangerous commands
        if (isDangerous(command) && !autoApprove) {
          const allowed = await onConfirmDangerous(command, description);
          if (!allowed) {
            return {
              stdout: "",
              stderr: "Command cancelled by user",
              exitCode: 1,
            };
          }
        }

        const proc = spawnShell(command, cwd);
        const timer = setTimeout(() => proc.kill(), timeout);
        const [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        const exitCode = await proc.exited;
        clearTimeout(timer);

        return {
          stdout: truncate(stdout, MAX_OUTPUT),
          stderr: truncate(stderr, MAX_OUTPUT),
          exitCode,
        };
      },
    }),

    // ── Git tools ──────────────────────────────────────────────────────────

    gitStatus: tool({
      description: "Show git status of the project",
      inputSchema: z.object({}),
      execute: async () => {
        if (!existsSync(join(cwd, ".git"))) return { isGit: false, status: "Not a git repository" };
        try {
          const stdout = execSync("git status --porcelain", { cwd, encoding: "utf-8" });
          return { isGit: true, status: stdout };
        } catch (err: unknown) {
          return { isGit: true, error: (err as Error).message };
        }
      },
    }),

    gitDiff: tool({
      description: "Show git diff (staged or unstaged)",
      inputSchema: z.object({
        staged: z.boolean().optional().describe("Show staged diff if true"),
      }),
      execute: async ({ staged }) => {
        if (!existsSync(join(cwd, ".git"))) return { isGit: false, diff: "Not a git repository" };
        try {
          const cmd = staged ? "git diff --staged" : "git diff";
          const stdout = execSync(cmd, { cwd, encoding: "utf-8" });
          return { isGit: true, diff: stdout };
        } catch (err: unknown) {
          return { isGit: true, error: (err as Error).message };
        }
      },
    }),

    gitLog: tool({
      description: "Show recent git commit history",
      inputSchema: z.object({
        limit: z.number().optional().default(20).describe("Number of commits to show"),
      }),
      execute: async ({ limit = 20 }) => {
        if (!existsSync(join(cwd, ".git"))) return { isGit: false, log: "Not a git repository" };
        try {
          const stdout = execSync(`git log --oneline -n ${limit}`, { cwd, encoding: "utf-8" });
          return { isGit: true, log: stdout };
        } catch (err: unknown) {
          return { isGit: true, error: (err as Error).message };
        }
      },
    }),

    gitCommit: tool({
      description: "Stage all changes and create a git commit",
      inputSchema: z.object({
        message: z.string().describe("Commit message"),
      }),
      execute: async ({ message }) => {
        if (!existsSync(join(cwd, ".git"))) throw new Error("Not a git repository");

        // Always confirm git commits
        if (!autoApprove) {
          const allowed = await onConfirmDangerous(
            `git commit -m "${message}"`,
            "Create a git commit with all staged changes",
          );
          if (!allowed) return { success: false, reason: "Commit cancelled by user" };
        }

        execSync("git add -A", { cwd });
        const safeMsg = message.replace(/"/g, '\\"');
        const stdout = execSync(`git commit -m "${safeMsg}"`, { cwd, encoding: "utf-8" });
        return { success: true, commit: stdout };
      },
    }),
  };
}
