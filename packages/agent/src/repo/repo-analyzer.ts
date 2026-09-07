/**
 * CODEXA — RepoAnalyzer
 *
 * Inspects a repository folder and determines framework, language, package manager,
 * key entry points, dependencies, license, and potential integration points.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RepositoryAnalysis } from "@codexa/shared";

export class RepoAnalyzer {
  public analyzeRepository(repoDir: string, url: string = ""): RepositoryAnalysis {
    const repoName = repoDir.split("/").pop() || "repository";
    let framework = "generic";
    let language = "javascript";
    let packageManager = "npm";
    let license = "Unknown";
    const dependencies: string[] = [];
    const entryPoints: string[] = [];
    const importantFiles: string[] = [];
    const environmentVariables: string[] = [];

    // Check package.json
    const pkgPath = join(repoDir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.license) license = pkg.license;
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        Object.keys(allDeps).forEach((d) => { dependencies.push(d); });

        if (allDeps["next"]) framework = "next.js";
        else if (allDeps["react"]) framework = "react";
        else if (allDeps["vue"]) framework = "vue";
        else if (allDeps["express"]) framework = "express";

        if (allDeps["typescript"] || existsSync(join(repoDir, "tsconfig.json"))) {
          language = "typescript";
        }
      } catch {}
    }

    // Check LICENSE file
    for (const licFile of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
      if (existsSync(join(repoDir, licFile))) {
        importantFiles.push(licFile);
        const licText = readFileSync(join(repoDir, licFile), "utf-8");
        if (licText.includes("MIT")) license = "MIT";
        else if (licText.includes("Apache")) license = "Apache-2.0";
        else if (licText.includes("GPL")) license = "GPL";
      }
    }

    // Check lockfiles
    if (existsSync(join(repoDir, "bun.lockb")) || existsSync(join(repoDir, "bun.lock"))) packageManager = "bun";
    else if (existsSync(join(repoDir, "pnpm-lock.yaml"))) packageManager = "pnpm";
    else if (existsSync(join(repoDir, "yarn.lock"))) packageManager = "yarn";

    // Scan top-level files
    try {
      const topEntries = readdirSync(repoDir);
      topEntries.forEach((e) => {
        if (["README.md", "Dockerfile", ".env.example", "components", "src"].includes(e)) {
          importantFiles.push(e);
        }
      });
    } catch {}

    // Check env example
    if (existsSync(join(repoDir, ".env.example"))) {
      try {
        const envText = readFileSync(join(repoDir, ".env.example"), "utf-8");
        envText.split("\n").forEach((l) => {
          const key = l.split("=")[0]?.trim();
          if (key && !key.startsWith("#")) environmentVariables.push(key);
        });
      } catch {}
    }

    return {
      url,
      name: repoName,
      description: `Analysis for repository ${repoName}`,
      framework,
      language,
      packageManager,
      entryPoints,
      architecture: `${framework} application using ${language}`,
      dependencies,
      importantFiles,
      integrationPoints: ["src/components", "src/lib", "app/"],
      license,
      environmentVariables,
    };
  }
}
