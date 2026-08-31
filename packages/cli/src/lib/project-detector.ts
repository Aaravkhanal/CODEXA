import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export interface ProjectInfo {
  name: string;
  path: string;
  frameworks: string[];
  languages: string[];
  packageManager: string;
  testFramework: string;
  gitStatus: string;
  fileCount: number;
  hasGit: boolean;
}

export function detectProject(cwd: string = process.cwd()): ProjectInfo {
  const info: ProjectInfo = {
    name: "unknown-project",
    path: cwd,
    frameworks: [],
    languages: [],
    packageManager: "npm",
    testFramework: "none",
    gitStatus: "not a git repository",
    fileCount: 0,
    hasGit: false,
  };

  // Name detection via folder or package.json
  const folderName = cwd.split(/[/\\]/).pop() || "unknown-project";
  info.name = folderName;

  // Read package.json if present
  const packageJsonPath = join(cwd, "package.json");
  let packageJson: any = null;
  if (existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (packageJson.name) {
        info.name = packageJson.name;
      }
    } catch {
      // Ignored
    }
  }

  // Detect frameworks/libraries from package.json or file presence
  const deps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };

  if (deps.react) info.frameworks.push("React");
  if (deps.next) info.frameworks.push("Next.js");
  if (deps.vue) info.frameworks.push("Vue");
  if (deps.svelte) info.frameworks.push("Svelte");
  if (deps.express) info.frameworks.push("Express");
  if (deps.hono) info.frameworks.push("Hono");
  if (deps.vite || existsSync(join(cwd, "vite.config.ts")) || existsSync(join(cwd, "vite.config.js"))) {
    info.frameworks.push("Vite");
  }

  // Detect languages
  if (deps.typescript || existsSync(join(cwd, "tsconfig.json"))) {
    info.languages.push("TypeScript");
  }
  // Standard check
  if (existsSync(packageJsonPath)) {
    info.languages.push("JavaScript");
  }

  // Fallbacks or extensions
  if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) {
    info.languages.push("Python");
  }
  if (existsSync(join(cwd, "Cargo.toml"))) {
    info.languages.push("Rust");
  }
  if (existsSync(join(cwd, "go.mod"))) {
    info.languages.push("Go");
  }

  // Detect package manager
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) {
    info.packageManager = "bun";
  } else if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    info.packageManager = "pnpm";
  } else if (existsSync(join(cwd, "yarn.lock"))) {
    info.packageManager = "yarn";
  } else {
    info.packageManager = "npm";
  }

  // Detect test frameworks
  if (deps.vitest) info.testFramework = "Vitest";
  else if (deps.jest) info.testFramework = "Jest";
  else if (deps.mocha) info.testFramework = "Mocha";
  else if (deps.playwright) info.testFramework = "Playwright";

  // Git detection
  const gitDir = join(cwd, ".git");
  if (existsSync(gitDir)) {
    info.hasGit = true;
    try {
      const statusRaw = execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
      const lines = statusRaw.split("\n").filter(Boolean);
      if (lines.length === 0) {
        info.gitStatus = "clean";
      } else {
        info.gitStatus = `${lines.length} modified/untracked files`;
      }
    } catch {
      info.gitStatus = "git active";
    }
  }

  // Simple file count (shallow/approximate for quick display)
  try {
    const listRaw = execSync("git ls-files", { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    info.fileCount = listRaw.split("\n").filter(Boolean).length;
  } catch {
    // Fallback if not a git repository
    info.fileCount = 0;
  }

  return info;
}
