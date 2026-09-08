import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

export interface ProjectInfo {
  name: string;
  path: string;
  frameworks: string[];
  languages: string[];
  packageManager: string;
  testFramework: string;
  gitStatus: string;
  gitBranch?: string;
  fileCount: number;
  hasGit: boolean;
  isSystemOrHomeDir: boolean;
}

/**
 * Checks if a given path is the user's home directory or root system directory.
 */
export function isSystemOrHomeDirectory(targetPath: string): boolean {
  const resolved = resolve(targetPath);
  const home = resolve(homedir());
  if (resolved === home) return true;
  if (resolved === "/" || /^[A-Za-z]:[\\/]?$/.test(resolved)) return true;
  if (resolved === "/Users" || resolved === "/home" || resolved === "/root") return true;
  return false;
}

export function detectProject(cwd: string = process.cwd()): ProjectInfo {
  const resolvedCwd = resolve(cwd);
  const isSystemOrHomeDir = isSystemOrHomeDirectory(resolvedCwd);

  const info: ProjectInfo = {
    name: "unknown-project",
    path: resolvedCwd,
    frameworks: [],
    languages: [],
    packageManager: "npm",
    testFramework: "none",
    gitStatus: "not a git repository",
    fileCount: 0,
    hasGit: false,
    isSystemOrHomeDir,
  };

  // Name detection via folder or package.json
  const folderName = resolvedCwd.split(/[/\\]/).pop() || "unknown-project";
  info.name = folderName;

  // Read package.json if present
  const packageJsonPath = join(resolvedCwd, "package.json");
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
  if (deps.angular || deps["@angular/core"]) info.frameworks.push("Angular");
  if (deps.express) info.frameworks.push("Express");
  if (deps.hono) info.frameworks.push("Hono");
  if (deps.fastify || deps["@fastify/core"]) info.frameworks.push("Fastify");
  if (deps.vite || existsSync(join(resolvedCwd, "vite.config.ts")) || existsSync(join(resolvedCwd, "vite.config.js"))) {
    info.frameworks.push("Vite");
  }

  // Detect languages
  if (deps.typescript || existsSync(join(resolvedCwd, "tsconfig.json"))) {
    info.languages.push("TypeScript");
  }
  if (existsSync(packageJsonPath)) {
    info.languages.push("JavaScript");
  }

  // Python
  if (existsSync(join(resolvedCwd, "requirements.txt")) || existsSync(join(resolvedCwd, "pyproject.toml")) || existsSync(join(resolvedCwd, "Pipfile"))) {
    info.languages.push("Python");
    if (existsSync(join(resolvedCwd, "Pipfile"))) info.packageManager = "pipenv";
    else if (existsSync(join(resolvedCwd, "pyproject.toml"))) info.packageManager = "poetry/pip";
    else info.packageManager = "pip";

    if (existsSync(join(resolvedCwd, "pytest.ini")) || existsSync(join(resolvedCwd, "tests"))) {
      info.testFramework = "pytest";
    }
  }

  // Rust
  if (existsSync(join(resolvedCwd, "Cargo.toml"))) {
    info.languages.push("Rust");
    info.packageManager = "cargo";
    info.testFramework = "cargo test";
  }

  // Go
  if (existsSync(join(resolvedCwd, "go.mod"))) {
    info.languages.push("Go");
    info.packageManager = "go";
    info.testFramework = "go test";
  }

  // Java / Kotlin
  if (existsSync(join(resolvedCwd, "pom.xml"))) {
    info.languages.push("Java");
    info.packageManager = "maven";
    info.testFramework = "junit";
  } else if (existsSync(join(resolvedCwd, "build.gradle")) || existsSync(join(resolvedCwd, "build.gradle.kts"))) {
    info.languages.push("Java/Kotlin");
    info.packageManager = "gradle";
    info.testFramework = "gradle test";
  }

  // PHP
  if (existsSync(join(resolvedCwd, "composer.json"))) {
    info.languages.push("PHP");
    info.packageManager = "composer";
    info.testFramework = "phpunit";
  }

  // Ruby
  if (existsSync(join(resolvedCwd, "Gemfile"))) {
    info.languages.push("Ruby");
    info.packageManager = "bundler";
    info.testFramework = "rspec";
  }

  // C/C++
  if (existsSync(join(resolvedCwd, "CMakeLists.txt")) || existsSync(join(resolvedCwd, "Makefile"))) {
    if (!info.languages.includes("C/C++")) info.languages.push("C/C++");
  }

  // Package manager for JS/TS
  if (existsSync(join(resolvedCwd, "bun.lock")) || existsSync(join(resolvedCwd, "bun.lockb"))) {
    info.packageManager = "bun";
  } else if (existsSync(join(resolvedCwd, "pnpm-lock.yaml"))) {
    info.packageManager = "pnpm";
  } else if (existsSync(join(resolvedCwd, "yarn.lock"))) {
    info.packageManager = "yarn";
  } else if (existsSync(packageJsonPath)) {
    info.packageManager = "npm";
  }

  // Test frameworks for JS/TS
  if (deps.vitest) info.testFramework = "Vitest";
  else if (deps.jest) info.testFramework = "Jest";
  else if (deps.mocha) info.testFramework = "Mocha";
  else if (deps.playwright) info.testFramework = "Playwright";

  // Deduplicate languages and frameworks
  info.languages = Array.from(new Set(info.languages));
  info.frameworks = Array.from(new Set(info.frameworks));

  // Git detection
  const gitDir = join(resolvedCwd, ".git");
  if (existsSync(gitDir)) {
    info.hasGit = true;
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: resolvedCwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (branch) info.gitBranch = branch;
    } catch {}

    try {
      const statusRaw = execSync("git status --porcelain", { cwd: resolvedCwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
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

  // Fast approximate file count
  try {
    const listRaw = execSync("git ls-files", { cwd: resolvedCwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    info.fileCount = listRaw.split("\n").filter(Boolean).length;
  } catch {
    // Non-git fallback: count top 2 levels
    try {
      let count = 0;
      const countEntries = (dir: string, depth = 0) => {
        if (depth > 2 || count > 500) return;
        const entries = readdirSync(dir);
        for (const entry of entries) {
          if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" || entry === "target") continue;
          try {
            const st = statSync(join(dir, entry));
            if (st.isFile()) count++;
            else if (st.isDirectory()) countEntries(join(dir, entry), depth + 1);
          } catch {}
        }
      };
      countEntries(resolvedCwd);
      info.fileCount = count;
    } catch {
      info.fileCount = 0;
    }
  }

  return info;
}
