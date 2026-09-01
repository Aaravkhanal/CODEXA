import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getAllApiKeys } from "./api-keys";
import { detectProject } from "./project-detector";
import { loadMcpConfig } from "../../../server/src/mcp/config";

export interface DoctorCheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string[];
}

export async function runDoctorChecks(cwd: string = process.cwd()): Promise<{
  allPassed: boolean;
  results: DoctorCheckResult[];
}> {
  const results: DoctorCheckResult[] = [];

  // Check 1: CLI & Bun Environment Version
  try {
    const pkgPath = join(import.meta.dir, "../../package.json");
    let cliVersion = "unknown";
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      cliVersion = pkg.version || "unknown";
    }
    const bunVersion = Bun.version || "unknown";
    results.push({
      name: "CLI & Runtime Version",
      passed: true,
      message: `CODEXA v${cliVersion} (Bun v${bunVersion})`,
    });
  } catch (err: any) {
    results.push({
      name: "CLI & Runtime Version",
      passed: false,
      message: `Failed to detect version: ${err.message}`,
    });
  }

  // Check 2: API Keys Configuration (~/.codexa/api-keys.json)
  try {
    const keysDir = join(homedir(), ".codexa");
    const keysFile = join(keysDir, "api-keys.json");
    const storedKeys = getAllApiKeys();
    const envKeys = {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      google: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY),
    };

    const configuredProviders: string[] = [];
    if (storedKeys.anthropic || envKeys.anthropic) configuredProviders.push("anthropic");
    if (storedKeys.openai || envKeys.openai) configuredProviders.push("openai");
    if (storedKeys.google || envKeys.google) configuredProviders.push("google");
    if (storedKeys.groq || envKeys.groq) configuredProviders.push("groq");

    const hasFile = existsSync(keysFile);
    if (configuredProviders.length > 0) {
      results.push({
        name: "API Keys Storage",
        passed: true,
        message: `Found API keys for [${configuredProviders.join(", ")}] (${hasFile ? "~/.codexa/api-keys.json" : "environment variables"})`,
      });
    } else {
      results.push({
        name: "API Keys Storage",
        passed: false,
        message: "No API keys configured in ~/.codexa/api-keys.json or environment variables",
        details: [
          "Run 'codexa setup' or set ANTHROPIC_API_KEY / OPENAI_API_KEY in your environment.",
        ],
      });
    }
  } catch (err: any) {
    results.push({
      name: "API Keys Storage",
      passed: false,
      message: `Error checking API keys: ${err.message}`,
    });
  }

  // Check 3: MCP Configuration (.codexa/mcp.json)
  try {
    const loadedMcp = await loadMcpConfig(cwd);
    if (!loadedMcp.exists) {
      results.push({
        name: "MCP Configuration",
        passed: true,
        message: "No project .codexa/mcp.json found (optional)",
      });
    } else {
      const serverNames = Object.keys(loadedMcp.config.servers);
      const serverDetails: string[] = [];
      let allServersReachable = true;

      for (const name of serverNames) {
        const srv = loadedMcp.config.servers[name]!;
        if (!srv.enabled) {
          serverDetails.push(`  - ${name} (${srv.transport}): disabled`);
          continue;
        }
        if (srv.transport === "stdio") {
          const bin = srv.command;
          const whichRes = Bun.which(bin);
          if (whichRes) {
            serverDetails.push(`  - ${name} (stdio): command '${bin}' reachable (${whichRes})`);
          } else {
            allServersReachable = false;
            serverDetails.push(`  - ${name} (stdio): command '${bin}' NOT found in PATH`);
          }
        } else if (srv.transport === "http") {
          try {
            const resp = await fetch(srv.url, { method: "HEAD" });
            serverDetails.push(`  - ${name} (http): ${srv.url} responded with status ${resp.status}`);
          } catch (e: any) {
            allServersReachable = false;
            serverDetails.push(`  - ${name} (http): ${srv.url} unreachable (${e.message})`);
          }
        }
      }

      results.push({
        name: "MCP Configuration",
        passed: allServersReachable,
        message: `Parsed ${serverNames.length} server(s) from ${loadedMcp.configPath}`,
        details: serverDetails,
      });
    }
  } catch (err: any) {
    results.push({
      name: "MCP Configuration",
      passed: false,
      message: `Failed to parse .codexa/mcp.json: ${err.message}`,
    });
  }

  // Check 4: Project Detector & Environment Context
  try {
    const proj = detectProject(cwd);
    results.push({
      name: "Project Environment",
      passed: true,
      message: `Detected '${proj.name}' (${proj.languages.join(", ") || "generic"}, ${proj.packageManager})`,
    });
  } catch (err: any) {
    results.push({
      name: "Project Environment",
      passed: false,
      message: `Failed to detect project details: ${err.message}`,
    });
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

export async function printDoctorReport(cwd: string = process.cwd()): Promise<boolean> {
  console.log("\n🏥 Running CODEXA System Diagnostics...\n");
  const { allPassed, results } = await runDoctorChecks(cwd);

  for (const res of results) {
    const symbol = res.passed ? "✓" : "✗";
    const statusText = res.passed ? "PASS" : "FAIL";
    console.log(`  [${symbol}] ${res.name}: ${res.message}`);
    if (res.details && res.details.length > 0) {
      for (const line of res.details) {
        console.log(`      ${line}`);
      }
    }
  }

  console.log("\n------------------------------------------------");
  if (allPassed) {
    console.log("🎉 All diagnostic checks PASSED! CODEXA is ready for action.\n");
  } else {
    console.log("⚠️ Some diagnostic checks FAILED. Please review issues above.\n");
  }

  return allPassed;
}
