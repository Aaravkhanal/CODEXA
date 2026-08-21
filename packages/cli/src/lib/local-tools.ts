import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { toolInputSchemas, Mode, type ModeType } from "@codexa/shared";

const MAX_FILE_SIZE = 10_000;
const MAX_RESULTS = 200;
const MAX_MATCHES = 50;
const MAX_OUTPUT = 20_000;
const DEFAULT_TIMEOUT = 30_000;

const IS_WINDOWS = process.platform === "win32";

function resolveInsideCwd(path: string) {
  const cwd = process.cwd();
  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Path is outside the project directory");
  }

  return { cwd, resolved };
}

function truncate(value: string, limit: number) {
  return value.length > limit
    ? `${value.slice(0, limit)}\n... (truncated, ${value.length} total chars)`
    : value;
}

/**
 * Spawns a shell command in a cross-platform way.
 * - Windows: uses `powershell.exe -NonInteractive -Command`
 * - macOS / Linux: uses `bash -c`
 */
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

export async function executeLocalTool(
  toolName: string,
  input: unknown,
  mode: ModeType,
) {
  if (
    mode === Mode.PLAN &&
    !["readFile", "listDirectory", "glob", "grep"].includes(toolName)
  ) {
    throw new Error(`Tool ${toolName} is not available in PLAN mode`);
  }

  switch (toolName) {
    case "readFile": {
      const { path } = toolInputSchemas.readFile.parse(input);
      const { resolved } = resolveInsideCwd(path);
      const content = await readFile(resolved, "utf-8");
      return content.length > MAX_FILE_SIZE
        ? {
            content: content.slice(0, MAX_FILE_SIZE),
            truncated: true,
            totalLength: content.length,
          }
        : { content };
    }

    case "listDirectory": {
      const { path } = toolInputSchemas.listDirectory.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const entries = await readdir(resolved);
      const results: { name: string; type: "file" | "directory" }[] = [];

      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const info = await stat(join(resolved, entry));
        results.push({
          name: entry,
          type: info.isDirectory() ? "directory" : "file",
        });
      }

      results.sort((a, b) =>
        a.type !== b.type
          ? a.type === "directory"
            ? -1
            : 1
          : a.name.localeCompare(b.name),
      );
      return { path: relative(cwd, resolved) || ".", entries: results };
    }

    case "glob": {
      const { pattern, path } = toolInputSchemas.glob.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const glob = new Bun.Glob(pattern);
      const files: string[] = [];
      let truncated = false;

      for await (const match of glob.scan({
        cwd: resolved,
        dot: false,
        onlyFiles: true,
      })) {
        if (match.includes("node_modules")) continue;
        if (files.length >= MAX_RESULTS) {
          truncated = true;
          break;
        }
        // Normalize path separators for cross-platform consistency
        files.push(relative(cwd, resolve(resolved, match)).replaceAll("\\", "/"));
      }

      files.sort();
      return { files, ...(truncated ? { truncated: true } : {}) };
    }

    case "grep": {
      const { pattern, path, include } = toolInputSchemas.grep.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);

      let stdout: string;
      let stderr: string;
      let exitCode: number;

      if (IS_WINDOWS) {
        // Use PowerShell Select-String as a portable grep substitute on Windows
        const safeResolved = resolved.replaceAll("'", "''");
        const safePattern = pattern.replaceAll("'", "''");
        const includeClause = include ? `-Include '${include}'` : "";
        const psCommand = [
          `Get-ChildItem -Recurse -File -Path '${safeResolved}' ${includeClause}`,
          `| Select-String -Pattern '${safePattern}' -CaseSensitive`,
          `| ForEach-Object { "$($_.Path):$($_.LineNumber):$($_.Line)" }`,
        ].join(" ");
        const proc = Bun.spawn(
          ["powershell.exe", "-NonInteractive", "-NoProfile", "-Command", psCommand],
          { cwd, stdout: "pipe", stderr: "pipe" },
        );
        [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        exitCode = await proc.exited;
      } else {
        const args = [
          "-rn",
          "--color=never",
          "--exclude-dir=node_modules",
          "--exclude-dir=.git",
          "-E",
        ];
        if (include) args.push(`--include=${include}`);
        args.push(pattern, resolved);

        const proc = Bun.spawn(["grep", ...args], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
        });
        [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        exitCode = await proc.exited;

        if (exitCode !== 0 && exitCode !== 1) {
          throw new Error(`grep failed: ${stderr.trim()}`);
        }
      }

      if (!stdout.trim()) {
        return { matches: [], message: "No matches found" };
      }

      const lines = stdout.split("\n").filter(Boolean);
      const matches: { file: string; line: number; content: string }[] = [];
      let truncated = false;

      for (const line of lines) {
        if (matches.length >= MAX_MATCHES) {
          truncated = true;
          break;
        }
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          matches.push({
            // Normalize Windows backslashes to forward slashes
            file: relative(cwd, match[1]!).replaceAll("\\", "/"),
            line: Number(match[2]),
            content: match[3]!,
          });
        }
      }

      return {
        matches,
        ...(truncated
          ? { truncated: true, totalMatches: lines.length }
          : {}),
      };
    }

    case "writeFile": {
      const { path, content } = toolInputSchemas.writeFile.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, "utf-8");
      return {
        success: true as const,
        path: relative(cwd, resolved).replaceAll("\\", "/"),
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      };
    }

    case "editFile": {
      const { path, oldString, newString } =
        toolInputSchemas.editFile.parse(input);
      const { cwd, resolved } = resolveInsideCwd(path);
      const content = await readFile(resolved, "utf-8");
      const occurrences = content.split(oldString).length - 1;

      if (occurrences === 0) throw new Error("oldString not found in file");
      if (occurrences > 1)
        throw new Error(
          `oldString is ambiguous; found ${occurrences} matches`,
        );

      await writeFile(
        resolved,
        content.replace(oldString, newString),
        "utf-8",
      );
      return {
        success: true as const,
        path: relative(cwd, resolved).replaceAll("\\", "/"),
      };
    }

    case "bash": {
      const { command, timeout = DEFAULT_TIMEOUT } =
        toolInputSchemas.bash.parse(input);
      const proc = spawnShell(command, resolveInsideCwd(".").resolved);
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
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
