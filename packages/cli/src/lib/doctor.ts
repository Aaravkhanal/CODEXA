import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type ProviderConfig, testProviderConnection } from "@codexa/agent";
import { getAllApiKeys } from "./api-keys.ts";
import { getActiveProviderConfig, getCodexaDir } from "./global-config.ts";
import { detectProject, type ProjectInfo } from "./project-detector.ts";

declare const CODEXA_VERSION: string | undefined;

type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheckResult {
  name: string;
  passed: boolean;
  status: DoctorStatus;
  message: string;
  details?: string[];
}

export interface DoctorOptions {
  /** Disable the real provider request in tests or offline automation. */
  verifyModelConnection?: boolean;
}

interface McpServerConfig {
  enabled?: boolean;
  transport?: "stdio" | "http";
  command?: string;
  url?: string;
}

interface ProjectPackageJson {
  scripts?: Record<string, string>;
}

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function result(
  name: string,
  status: DoctorStatus,
  message: string,
  details?: string[],
): DoctorCheckResult {
  return { name, status, passed: status !== "fail", message, details };
}

function run(command: string, args: string[], cwd?: string) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 8_000,
  });
}

function loadMcpConfig(cwd: string): {
  exists: boolean;
  configPath: string;
  servers: Record<string, McpServerConfig>;
} {
  const configPath = join(cwd, ".codexa", "mcp.json");
  if (!existsSync(configPath)) return { exists: false, configPath, servers: {} };

  const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as {
    servers?: Record<string, McpServerConfig>;
  };
  return { exists: true, configPath, servers: parsed.servers ?? {} };
}

function findWritablePath(target: string): string {
  let current = target;
  while (!existsSync(current) && dirname(current) !== current) current = dirname(current);
  return current;
}

function detectTestCommand(cwd: string, project: ProjectInfo): string | null {
  const packagePath = join(cwd, "package.json");
  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as ProjectPackageJson;
      if (pkg.scripts?.test) {
        if (project.packageManager === "bun") return "bun run test";
        if (project.packageManager === "yarn") return "yarn test";
        if (project.packageManager === "pnpm") return "pnpm test";
        return "npm test";
      }
    } catch {
      // The project check will report malformed project metadata.
    }
  }

  const frameworkCommands: Record<string, string> = {
    pytest: "pytest",
    "cargo test": "cargo test",
    "go test": "go test ./...",
    junit: project.packageManager === "maven" ? "mvn test" : "./gradlew test",
    "gradle test": "./gradlew test",
    phpunit: "vendor/bin/phpunit",
    rspec: "bundle exec rspec",
    Vitest: "vitest run",
    Jest: "jest",
    Mocha: "mocha",
    Playwright: "playwright test",
  };
  const frameworkCommand = frameworkCommands[project.testFramework];
  if (frameworkCommand) return frameworkCommand;

  const tracked = run("git", ["-C", cwd, "ls-files"]);
  const hasTests =
    tracked.status === 0 && /(^|\/)[^\n]+\.(test|spec)\.[^\n]+/m.test(tracked.stdout ?? "");
  if (hasTests && project.packageManager === "bun") return "bun test";
  return null;
}

function packageManagerExecutable(packageManager: string): string {
  if (packageManager === "poetry/pip") return Bun.which("poetry") ? "poetry" : "pip";
  return packageManager;
}

async function checkSelectedModel(verifyConnection: boolean): Promise<DoctorCheckResult> {
  const active = getActiveProviderConfig();
  if (!active) {
    return result("Selected model", "fail", "No active provider profile", ["Run 'codexa setup'."]);
  }

  const { profile, apiKey, baseUrl } = active;
  if (profile.provider !== "ollama" && !apiKey) {
    return result("Selected model", "fail", `${profile.provider}/${profile.model} has no API key`, [
      "Run 'codexa config' or set the provider API-key environment variable.",
    ]);
  }
  if (!verifyConnection) {
    return result("Selected model", "warn", `${profile.provider}/${profile.model} configured`, [
      "Live model request skipped by diagnostic options.",
    ]);
  }

  const config = {
    provider: profile.provider,
    model: profile.model,
    apiKey,
    baseUrl,
  } as ProviderConfig;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DoctorCheckResult>((resolve) => {
    timeoutId = setTimeout(
      () =>
        resolve(
          result("Selected model", "fail", `${profile.provider}/${profile.model} timed out`, [
            "Provider did not respond within 15 seconds.",
          ]),
        ),
      15_000,
    );
  });
  const verification = testProviderConnection(config).then((tested) =>
    tested.success
      ? result(
          "Selected model",
          "pass",
          `${profile.provider}/${profile.model} responded successfully`,
          [
            tested.latencyMs === undefined
              ? "Live provider request completed."
              : `Latency: ${tested.latencyMs}ms`,
          ],
        )
      : result("Selected model", "fail", `${profile.provider}/${profile.model} could not be used`, [
          tested.error ?? "Unknown provider error",
        ]),
  );
  return Promise.race([verification, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function checkInstallationHealth(): DoctorCheckResult {
  const commandPath = Bun.which("codexa");
  if (!commandPath) {
    return result("Install health", "fail", "The 'codexa' command is not available in PATH", [
      "Install with Homebrew or: npm install -g @aaravkhanal/codexa",
    ]);
  }

  const version = run(commandPath, ["--version"]);
  if (version.status !== 0) {
    return result(
      "Install health",
      "fail",
      `Command found at ${commandPath}, but it cannot start`,
      [(version.stderr || version.stdout || "Unknown startup error").trim()],
    );
  }

  const details = [`Command: ${commandPath}`, `Version: ${(version.stdout || "unknown").trim()}`];
  const brew = Bun.which("brew");
  const npm = Bun.which("npm");
  const brewInstall = brew ? run(brew, ["list", "--versions", "codexa"]) : null;
  const npmInstall = npm
    ? run(npm, ["list", "-g", "@aaravkhanal/codexa", "--depth=0", "--json"])
    : null;

  details.push(
    brewInstall?.status === 0 && brewInstall.stdout.trim()
      ? `Homebrew: ${brewInstall.stdout.trim()}`
      : "Homebrew: package not installed",
  );
  details.push(
    npmInstall?.status === 0 && npmInstall.stdout.includes("@aaravkhanal/codexa")
      ? "npm: global package installed"
      : "npm: global package not installed",
  );
  return result("Install health", "pass", "Installed command starts correctly", details);
}

export async function runDoctorChecks(
  cwd: string = process.cwd(),
  options: DoctorOptions = {},
): Promise<{ allPassed: boolean; results: DoctorCheckResult[] }> {
  const results: DoctorCheckResult[] = [];
  const verifyModelConnection = options.verifyModelConnection ?? true;

  try {
    const pkgPath = join(import.meta.dir, "../../package.json");
    const bundledVersion = typeof CODEXA_VERSION === "string" ? CODEXA_VERSION : undefined;
    const cliVersion =
      bundledVersion ??
      (existsSync(pkgPath)
        ? ((JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string }).version ??
          "unknown")
        : "bundled");
    results.push(result("CLI & runtime", "pass", `CODEXA v${cliVersion} on Bun v${Bun.version}`));
  } catch (error) {
    results.push(
      result("CLI & runtime", "fail", `Version detection failed: ${messageFrom(error)}`),
    );
  }

  const active = getActiveProviderConfig();
  const providers = Object.keys(getAllApiKeys());
  if (active?.profile.provider === "ollama") {
    results.push(result("Credentials", "pass", "Ollama requires no API key"));
  } else if (providers.length > 0) {
    results.push(
      result("Credentials", "pass", `${providers.length} provider key(s) available`, [
        `Providers: ${providers.join(", ")}`,
        `Storage: ${getCodexaDir()}`,
      ]),
    );
  } else {
    results.push(
      result("Credentials", "fail", "No provider API key found", ["Run 'codexa setup'."]),
    );
  }

  results.push(await checkSelectedModel(verifyModelConnection));

  let project: ProjectInfo;
  try {
    project = detectProject(cwd);
    results.push(
      result("Project", "pass", `${project.name} detected`, [
        `Languages: ${project.languages.join(", ") || "generic"}`,
        `Files: ${project.fileCount}`,
      ]),
    );
  } catch (error) {
    project = {
      name: "unknown",
      path: cwd,
      frameworks: [],
      languages: [],
      packageManager: "unknown",
      testFramework: "none",
      gitStatus: "unknown",
      fileCount: 0,
      hasGit: false,
      isSystemOrHomeDir: false,
    };
    results.push(result("Project", "fail", `Project detection failed: ${messageFrom(error)}`));
  }

  const git = run("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
  results.push(
    git.status === 0
      ? result("Git repository", "pass", (git.stdout || cwd).trim(), [
          project.gitBranch ? `Branch: ${project.gitBranch}` : "Branch unavailable",
          `Working tree: ${project.gitStatus}`,
        ])
      : result("Git repository", "warn", "No Git repository detected", [
          "CODEXA can still chat, but checkpoints and change review are limited.",
        ]),
  );

  try {
    const projectWritable = findWritablePath(cwd);
    const configWritable = findWritablePath(getCodexaDir());
    accessSync(projectWritable, constants.W_OK);
    accessSync(configWritable, constants.W_OK);
    results.push(
      result("Write permissions", "pass", "Project and CODEXA config locations are writable", [
        `Project: ${projectWritable}`,
        `Config: ${configWritable}`,
      ]),
    );
  } catch (error) {
    results.push(
      result(
        "Write permissions",
        "fail",
        `A required location is not writable: ${messageFrom(error)}`,
      ),
    );
  }

  const managerExecutable = packageManagerExecutable(project.packageManager);
  const managerPath = Bun.which(managerExecutable);
  results.push(
    managerPath
      ? result("Package manager", "pass", `${project.packageManager} detected`, [
          `Executable: ${managerPath}`,
        ])
      : result(
          "Package manager",
          "fail",
          `${project.packageManager} detected but '${managerExecutable}' is unavailable`,
        ),
  );

  const testCommand = detectTestCommand(cwd, project);
  results.push(
    testCommand
      ? result("Test command", "pass", testCommand)
      : result("Test command", "warn", "No test command detected", [
          "Add a test script or supported test configuration to improve verification.",
        ]),
  );
  results.push(checkInstallationHealth());

  try {
    const loaded = loadMcpConfig(cwd);
    if (!loaded.exists) {
      results.push(result("MCP configuration", "pass", "No project MCP configuration (optional)"));
    } else {
      const details: string[] = [];
      let reachable = true;
      for (const [name, server] of Object.entries(loaded.servers)) {
        if (!server.enabled) {
          details.push(`${name}: disabled`);
        } else if (server.transport === "stdio" && server.command) {
          const executable = Bun.which(server.command);
          reachable &&= Boolean(executable);
          details.push(
            `${name}: ${executable ? `ready (${executable})` : `missing '${server.command}'`}`,
          );
        } else if (server.transport === "http" && server.url) {
          details.push(`${name}: configured (${server.url})`);
        }
      }
      results.push(
        result(
          "MCP configuration",
          reachable ? "pass" : "fail",
          `${Object.keys(loaded.servers).length} server(s) configured`,
          details,
        ),
      );
    }
  } catch (error) {
    results.push(
      result("MCP configuration", "fail", `Invalid .codexa/mcp.json: ${messageFrom(error)}`),
    );
  }

  return { allPassed: results.every((check) => check.status !== "fail"), results };
}

export async function printDoctorReport(
  cwd: string = process.cwd(),
  json = false,
  options: DoctorOptions = {},
): Promise<boolean> {
  const { allPassed, results } = await runDoctorChecks(cwd, options);
  if (json) {
    console.log(JSON.stringify({ allPassed, results }, null, 2));
    return allPassed;
  }

  const project = detectProject(cwd);
  console.log(
    `\n${colors.cyan}${colors.bold}╭────────────────────────────────────────────────────────────╮`,
  );
  console.log("│                    CODEXA DOCTOR                           │");
  console.log(`╰────────────────────────────────────────────────────────────╯${colors.reset}`);
  console.log(`${colors.dim}  Project: ${project.name}  •  ${cwd}${colors.reset}\n`);

  for (const check of results) {
    const appearance =
      check.status === "pass"
        ? { symbol: "✓", color: colors.green, label: "READY" }
        : check.status === "warn"
          ? { symbol: "!", color: colors.yellow, label: "NOTICE" }
          : { symbol: "✗", color: colors.red, label: "FIX" };
    console.log(
      `${appearance.color}  ${appearance.symbol} ${appearance.label.padEnd(6)}${colors.reset} ${colors.bold}${check.name}${colors.reset}`,
    );
    console.log(`             ${check.message}`);
    for (const detail of check.details ?? []) {
      console.log(`${colors.dim}             • ${detail}${colors.reset}`);
    }
    console.log();
  }

  const passed = results.filter((check) => check.status === "pass").length;
  const warnings = results.filter((check) => check.status === "warn").length;
  const failed = results.filter((check) => check.status === "fail").length;
  const summaryColor = failed > 0 ? colors.red : warnings > 0 ? colors.yellow : colors.green;
  console.log(
    `${summaryColor}${colors.bold}  Readiness: ${passed} ready • ${warnings} notice • ${failed} need attention${colors.reset}`,
  );
  console.log(
    allPassed
      ? `${colors.green}  CODEXA is ready to work in this project.${colors.reset}\n`
      : `${colors.red}  Fix the items above, then run 'codexa doctor' again.${colors.reset}\n`,
  );
  return allPassed;
}
