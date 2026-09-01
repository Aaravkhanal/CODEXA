import { execSync } from "node:child_process";

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxed: boolean;
  boundary: string;
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

  // Normalize path for volume mounting
  const normalizedCwd = cwd.replaceAll("\\", "/");
  const args = [
    "run",
    "--rm",
    "-v",
    `${normalizedCwd}:/workspace`,
    "-w",
    "/workspace",
    "oven/bun:1.3.13-alpine",
    "sh",
    "-c",
    command,
  ];

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

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
    sandboxed: true,
    boundary: "[Sandboxed Execution: docker (oven/bun:1.3.13-alpine)]",
  };
}
