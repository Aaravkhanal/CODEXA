import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SandboxConfig {
  /** Network policy: "none" (isolated default), "bridge" (enabled egress), or "host" */
  network: "none" | "bridge" | "host";
  /** CPU limit allocation (default: "2") */
  cpus: string;
  /** Memory cap (default: "2g") */
  memory: string;
  /** Container execution user (default: process uid:gid on POSIX) */
  user?: string;
}

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxed: boolean;
  boundary: string;
  config: SandboxConfig;
}

export function isDockerAvailable(): boolean {
  try {
    const whichRes = Bun.which("docker");
    if (!whichRes) return false;
    execSync("docker info", { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export function resolveSandboxConfig(cwd: string = process.cwd()): SandboxConfig {
  let network: "none" | "bridge" | "host" = (process.env.CODEXA_SANDBOX_NETWORK as any) || "none";
  let cpus = process.env.CODEXA_SANDBOX_CPUS || "2";
  let memory = process.env.CODEXA_SANDBOX_MEMORY || "2g";
  let user = process.env.CODEXA_SANDBOX_USER || undefined;

  // Check project-level .codexa/config.json override
  const configPath = join(cwd, ".codexa", "config.json");
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
      if (cfg.sandbox) {
        if (typeof cfg.sandbox.network === "string") {
          const net = cfg.sandbox.network.toLowerCase();
          if (net === "none" || net === "bridge" || net === "host") network = net;
        }
        if (typeof cfg.sandbox.cpus === "string" || typeof cfg.sandbox.cpus === "number") {
          cpus = String(cfg.sandbox.cpus);
        }
        if (typeof cfg.sandbox.memory === "string") {
          memory = cfg.sandbox.memory;
        }
        if (typeof cfg.sandbox.user === "string") {
          user = cfg.sandbox.user;
        }
      }
    } catch {
      // Ignore malformed config
    }
  }

  // Fallback to process UID/GID on POSIX if not specified
  if (!user && typeof process.getuid === "function" && typeof process.getgid === "function") {
    user = `${process.getuid()}:${process.getgid()}`;
  }

  return { network, cpus, memory, user };
}

export async function executeSandboxedCommand(
  command: string,
  cwd: string = process.cwd(),
  timeoutMs: number = 30000,
): Promise<SandboxExecutionResult> {
  const dockerAvailable = isDockerAvailable();

  if (!dockerAvailable) {
    throw new Error(
      "Docker is not installed or the Docker daemon is not running. Sandboxed execution requires Docker.",
    );
  }

  const sandboxConfig = resolveSandboxConfig(cwd);

  // Normalize path for volume mounting
  const normalizedCwd = cwd.replaceAll("\\", "/");
  const args = [
    "run",
    "--rm",
    "--network",
    sandboxConfig.network,
    "--cpus",
    sandboxConfig.cpus,
    "--memory",
    sandboxConfig.memory,
  ];

  if (sandboxConfig.user) {
    args.push("--user", sandboxConfig.user);
  }

  args.push(
    "-v",
    `${normalizedCwd}:/workspace`,
    "-w",
    "/workspace",
    "oven/bun:1.3.13-alpine",
    "sh",
    "-c",
    command,
  );

  const proc = Bun.spawn(["docker", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, TERM: "dumb" },
  });

  const timer = setTimeout(() => proc.kill(), timeoutMs);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  clearTimeout(timer);

  const userLabel = sandboxConfig.user ? ` | User: ${sandboxConfig.user}` : "";
  const boundary = `[Sandboxed Execution: docker (network: ${sandboxConfig.network} | CPUs: ${sandboxConfig.cpus} | Memory: ${sandboxConfig.memory}${userLabel})]`;

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
    sandboxed: true,
    boundary,
    config: sandboxConfig,
  };
}
