import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface VerificationResult {
  command: string;
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function detectVerificationCommand(cwd: string = process.cwd()): string | null {
  // 1. Check .codexa/config.json override
  const codexaConfigPath = join(cwd, ".codexa", "config.json");
  if (existsSync(codexaConfigPath)) {
    try {
      const cfg = JSON.parse(readFileSync(codexaConfigPath, "utf-8"));
      if (typeof cfg.verificationCommand === "string" && cfg.verificationCommand.trim()) {
        return cfg.verificationCommand.trim();
      }
      if (typeof cfg.testCommand === "string" && cfg.testCommand.trim()) {
        return cfg.testCommand.trim();
      }
    } catch {
      // Ignored
    }
  }

  // 2. Check package.json scripts (prefer check -> test -> lint)
  const packageJsonPath = join(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts = pkg.scripts || {};
      const pm = existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))
        ? "bun"
        : existsSync(join(cwd, "pnpm-lock.yaml"))
          ? "pnpm"
          : existsSync(join(cwd, "yarn.lock"))
            ? "yarn"
            : "npm";

      if (scripts.check) return `${pm} run check`;
      if (scripts.test) return `${pm} test`;
      if (scripts.lint) return `${pm} run lint`;
    } catch {
      // Ignored
    }
  }

  // 3. Check Makefile targets
  const makefilePath = join(cwd, "Makefile");
  if (existsSync(makefilePath)) {
    try {
      const content = readFileSync(makefilePath, "utf-8");
      if (/^check:/m.test(content)) return "make check";
      if (/^test:/m.test(content)) return "make test";
    } catch {
      // Ignored
    }
  }

  // 4. Check Cargo / Pytest / Go
  if (existsSync(join(cwd, "Cargo.toml"))) return "cargo test";
  if (existsSync(join(cwd, "pytest.ini")) || existsSync(join(cwd, "pyproject.toml"))) return "pytest";
  if (existsSync(join(cwd, "go.mod"))) return "go test ./...";

  return null;
}

export async function runVerificationCommand(
  cwd: string = process.cwd(),
  command?: string,
  timeoutMs: number = 45000,
): Promise<VerificationResult | null> {
  const targetCmd = command || detectVerificationCommand(cwd);
  if (!targetCmd) return null;

  const startMs = Date.now();
  const isWin = process.platform === "win32";

  try {
    const proc = isWin
      ? Bun.spawn(["powershell.exe", "-NonInteractive", "-NoProfile", "-Command", targetCmd], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
        })
      : Bun.spawn(["bash", "-c", targetCmd], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
        });

    const timer = setTimeout(() => proc.kill(), timeoutMs);

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    clearTimeout(timer);

    const durationMs = Date.now() - startMs;
    const passed = exitCode === 0;

    return {
      command: targetCmd,
      passed,
      exitCode,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      durationMs,
    };
  } catch (err: any) {
    return {
      command: targetCmd,
      passed: false,
      exitCode: 1,
      stdout: "",
      stderr: err.message || "Failed to execute verification command",
      durationMs: Date.now() - startMs,
    };
  }
}
