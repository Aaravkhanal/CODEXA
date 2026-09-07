/**
 * CODEXA — DependencyManager
 *
 * Inspects required package dependencies, determines whether they are installed,
 * detects the active package manager (`bun`, `npm`, `pnpm`, `yarn`, `pip`, `cargo`, `go`),
 * and executes safe non-destructive package installations.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DependencyPlan } from "@codexa/shared";

export class DependencyManager {
  private readonly cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = resolve(cwd);
  }

  /**
   * Analyze required packages against project manifests and create an install plan.
   */
  public planDependencies(requiredPackages: string[]): DependencyPlan {
    const pm = this.detectPackageManager();
    const installed = this.getInstalledPackages();

    const alreadyInstalled: string[] = [];
    const missing: string[] = [];

    for (const pkg of requiredPackages) {
      if (installed.has(pkg)) {
        alreadyInstalled.push(pkg);
      } else {
        missing.push(pkg);
      }
    }

    const installCommand = this.buildInstallCommand(pm, missing);

    return {
      alreadyInstalled,
      missing,
      packageManager: pm,
      installCommand,
    };
  }

  /**
   * Install missing packages using the detected package manager.
   */
  public installMissing(requiredPackages: string[]): { success: boolean; installed: string[]; output: string } {
    const plan = this.planDependencies(requiredPackages);
    if (plan.missing.length === 0) {
      return {
        success: true,
        installed: [],
        output: "All required dependencies are already installed.",
      };
    }

    try {
      const stdout = execSync(plan.installCommand, { cwd: this.cwd, encoding: "utf-8" });
      return {
        success: true,
        installed: plan.missing,
        output: stdout,
      };
    } catch (err: unknown) {
      return {
        success: false,
        installed: [],
        output: (err as Error).message,
      };
    }
  }

  private detectPackageManager(): DependencyPlan["packageManager"] {
    if (existsSync(join(this.cwd, "bun.lock")) || existsSync(join(this.cwd, "bun.lockb"))) return "bun";
    if (existsSync(join(this.cwd, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(this.cwd, "yarn.lock"))) return "yarn";
    if (existsSync(join(this.cwd, "requirements.txt")) || existsSync(join(this.cwd, "pyproject.toml"))) return "pip";
    if (existsSync(join(this.cwd, "Cargo.toml"))) return "cargo";
    if (existsSync(join(this.cwd, "go.mod"))) return "go";
    return "npm";
  }

  private getInstalledPackages(): Set<string> {
    const installed = new Set<string>();

    const pkgPath = join(this.cwd, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.dependencies) Object.keys(pkg.dependencies).forEach((k) => { installed.add(k); });
        if (pkg.devDependencies) Object.keys(pkg.devDependencies).forEach((k) => { installed.add(k); });
      } catch {}
    }

    return installed;
  }

  private buildInstallCommand(pm: DependencyPlan["packageManager"], missing: string[]): string {
    if (missing.length === 0) return "";
    const list = missing.join(" ");

    switch (pm) {
      case "bun":
        return `bun add ${list}`;
      case "pnpm":
        return `pnpm add ${list}`;
      case "yarn":
        return `yarn add ${list}`;
      case "pip":
        return `pip install ${list}`;
      case "cargo":
        return `cargo add ${list}`;
      case "go":
        return `go get ${list}`;
      case "npm":
      default:
        return `npm install ${list}`;
    }
  }
}
