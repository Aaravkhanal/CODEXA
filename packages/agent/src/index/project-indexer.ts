/**
 * CODEXA — Project Knowledge Graph & Indexer
 *
 * Scans project manifests, dependencies, file tree, database schema,
 * and architecture to produce a lightweight Project Knowledge Graph stored in `.codexa/memory/project-context.json`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ProjectKnowledgeGraph } from "@codexa/shared";

export class ProjectIndexer {
  private readonly cwd: string;
  private readonly memoryDir: string;
  private readonly indexPath: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = resolve(cwd);
    this.memoryDir = join(this.cwd, ".codexa", "memory");
    this.indexPath = join(this.memoryDir, "project-context.json");
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Scan project and generate or update the Knowledge Graph.
   */
  public generateKnowledgeGraph(): ProjectKnowledgeGraph {
    let name = this.cwd.split("/").pop() || "unknown-project";
    let packageManager = "bun";
    const dependencies: Record<string, string> = {};
    const devDependencies: Record<string, string> = {};
    const frameworks = new Set<string>();
    const languages = new Set<string>();

    // 1. Check Node.js / Bun package.json
    const pkgPath = join(this.cwd, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name) name = pkg.name;
        if (pkg.dependencies) Object.assign(dependencies, pkg.dependencies);
        if (pkg.devDependencies) Object.assign(devDependencies, pkg.devDependencies);
      } catch {}
    }

    // Detect Package Manager
    if (existsSync(join(this.cwd, "bun.lock")) || existsSync(join(this.cwd, "bun.lockb"))) packageManager = "bun";
    else if (existsSync(join(this.cwd, "pnpm-lock.yaml"))) packageManager = "pnpm";
    else if (existsSync(join(this.cwd, "yarn.lock"))) packageManager = "yarn";
    else if (existsSync(join(this.cwd, "package-lock.json"))) packageManager = "npm";

    // Detect Frameworks & Languages
    const allDeps = { ...dependencies, ...devDependencies };
    if (allDeps.react || allDeps["react-dom"]) { frameworks.add("react"); languages.add("typescript"); }
    if (allDeps.next) { frameworks.add("next.js"); languages.add("typescript"); }
    if (allDeps.vue) frameworks.add("vue");
    if (allDeps.express) frameworks.add("express");
    if (allDeps.hono) frameworks.add("hono");
    if (allDeps["@fastify/core"] || allDeps.fastify) frameworks.add("fastify");

    // Check Python
    if (existsSync(join(this.cwd, "requirements.txt")) || existsSync(join(this.cwd, "pyproject.toml"))) {
      languages.add("python");
      packageManager = "pip";
    }

    // Check Rust
    if (existsSync(join(this.cwd, "Cargo.toml"))) {
      languages.add("rust");
      packageManager = "cargo";
    }

    // Check Go
    if (existsSync(join(this.cwd, "go.mod"))) {
      languages.add("go");
      packageManager = "go";
    }

    // Check Database
    let databaseType: string | undefined;
    if (allDeps["@prisma/client"] || existsSync(join(this.cwd, "prisma"))) databaseType = "prisma";
    else if (allDeps["drizzle-orm"]) databaseType = "drizzle";
    else if (allDeps.pg) databaseType = "postgresql";
    else if (allDeps.mongoose) databaseType = "mongodb";

    const graph: ProjectKnowledgeGraph = {
      projectName: name,
      frameworks: Array.from(frameworks),
      languages: Array.from(languages).length > 0 ? Array.from(languages) : ["typescript"],
      packageManager,
      dependencies,
      devDependencies,
      entryPoints: ["src/index.ts", "src/index.tsx", "src/main.ts", "app/page.tsx"].filter((p) =>
        existsSync(join(this.cwd, p)),
      ),
      architectureNotes: [
        `Package Manager: ${packageManager}`,
        `Languages: ${Array.from(languages).join(", ") || "typescript"}`,
      ],
      databaseType,
      routes: [],
      indexedAt: new Date().toISOString(),
    };

    writeFileSync(this.indexPath, JSON.stringify(graph, null, 2), "utf-8");
    return graph;
  }

  /**
   * Load existing Knowledge Graph or build a new one.
   */
  public getOrBuildGraph(): ProjectKnowledgeGraph {
    if (existsSync(this.indexPath)) {
      try {
        return JSON.parse(readFileSync(this.indexPath, "utf-8")) as ProjectKnowledgeGraph;
      } catch {}
    }
    return this.generateKnowledgeGraph();
  }
}
