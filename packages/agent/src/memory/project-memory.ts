/**
 * CODEXA — Persistent Project Memory & Session Summaries
 *
 * Manages project-level memory in `.codexa/`:
 *   .codexa/
 *   ├── memory.md          (Project purpose, architecture, conventions, active work)
 *   ├── project-map.json   (Lightweight cached knowledge graph)
 *   ├── sessions/          (Session transcripts / state)
 *   └── summaries/         (Concise incremental session summaries)
 *
 * NEVER stores API keys, credentials, or private tokens in project memory.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ProjectKnowledgeGraph } from "@codexa/shared";

export interface SessionSummaryEntry {
  sessionId: string;
  timestamp: number;
  task: string;
  summary: string;
  filesModified: string[];
  testsRun: boolean;
  testsPassed: boolean | null;
  unresolvedProblems?: string[];
  nextSteps?: string[];
}

export interface MemoryResumeInfo {
  hasMemory: boolean;
  projectName: string;
  lastSessionTimestamp?: number;
  lastSummary?: string;
  filesModified?: string[];
  testsPassed?: boolean | null;
  memoryContent?: string;
}

export class ProjectMemoryManager {
  private readonly cwd: string;
  private readonly codexaDir: string;
  private readonly memoryFile: string;
  private readonly projectMapFile: string;
  private readonly sessionsDir: string;
  private readonly summariesDir: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = resolve(cwd);
    this.codexaDir = join(this.cwd, ".codexa");
    this.memoryFile = join(this.codexaDir, "memory.md");
    this.projectMapFile = join(this.codexaDir, "project-map.json");
    this.sessionsDir = join(this.codexaDir, "sessions");
    this.summariesDir = join(this.codexaDir, "summaries");
  }

  public ensureDirs(): void {
    if (!existsSync(this.codexaDir)) mkdirSync(this.codexaDir, { recursive: true, mode: 0o755 });
    if (!existsSync(this.sessionsDir)) mkdirSync(this.sessionsDir, { recursive: true, mode: 0o755 });
    if (!existsSync(this.summariesDir)) mkdirSync(this.summariesDir, { recursive: true, mode: 0o755 });
  }

  public hasMemory(): boolean {
    return existsSync(this.memoryFile) || existsSync(this.summariesDir);
  }

  /**
   * Reads or initializes project memory.
   */
  public getOrInitMemory(graph?: Partial<ProjectKnowledgeGraph>): string {
    this.ensureDirs();
    if (existsSync(this.memoryFile)) {
      try {
        return readFileSync(this.memoryFile, "utf-8");
      } catch {}
    }

    const name = graph?.projectName || this.cwd.split(/[/\\]/).pop() || "project";
    const frameworks = (graph?.frameworks ?? []).join(", ") || "None detected";
    const languages = (graph?.languages ?? []).join(", ") || "None detected";
    const pm = graph?.packageManager || "npm";

    const defaultMemory = `# Project Memory: ${name}

## Project Purpose
Student software engineering workspace.

## Technology Stack
- **Languages**: ${languages}
- **Frameworks**: ${frameworks}
- **Package Manager**: ${pm}

## Architecture & Conventions
- Code style: Modern, clean, modular design.
- All secrets and API keys must be kept in local environment / credentials store only.

## Current Work & Recent Decisions
- Initial project index created by CodeXA agent.

## Known Issues & Notes
- None recorded yet.
`;

    writeFileSync(this.memoryFile, defaultMemory, "utf-8");
    return defaultMemory;
  }

  /**
   * Save or update raw memory.md content.
   */
  public saveMemory(content: string): void {
    this.ensureDirs();
    writeFileSync(this.memoryFile, content, "utf-8");
  }

  /**
   * Saves an incremental session summary and updates the memory.md active work section.
   */
  public recordSessionSummary(entry: SessionSummaryEntry): void {
    this.ensureDirs();
    const summaryFile = join(this.summariesDir, `${entry.timestamp}_${entry.sessionId.slice(0, 8)}.json`);
    writeFileSync(summaryFile, JSON.stringify(entry, null, 2), "utf-8");

    // Incrementally update memory.md without blowing away architecture notes
    let currentMemory = this.getOrInitMemory();
    const updateBlock = `\n### Session: ${new Date(entry.timestamp).toLocaleString()}\n- **Task**: ${entry.task}\n- **Summary**: ${entry.summary}\n- **Files Modified**: ${entry.filesModified.length > 0 ? entry.filesModified.join(", ") : "None"}\n- **Test Status**: ${entry.testsRun ? (entry.testsPassed ? "✓ Passed" : "✗ Failing") : "Not run"}\n`;

    if (currentMemory.includes("## Current Work & Recent Decisions")) {
      const parts = currentMemory.split("## Current Work & Recent Decisions");
      const remainder = parts[1] ?? "";
      const nextSectionIdx = remainder.indexOf("\n## ");
      if (nextSectionIdx !== -1) {
        currentMemory = `${parts[0]}## Current Work & Recent Decisions\n${updateBlock}${remainder.slice(nextSectionIdx)}`;
      } else {
        currentMemory = `${parts[0]}## Current Work & Recent Decisions\n${updateBlock}`;
      }
    } else {
      currentMemory += `\n## Current Work & Recent Decisions\n${updateBlock}`;
    }

    writeFileSync(this.memoryFile, currentMemory, "utf-8");
  }

  /**
   * Retrieves summary for resuming past work.
   */
  public getResumeInfo(): MemoryResumeInfo {
    const hasMem = this.hasMemory();
    const projectName = this.cwd.split(/[/\\]/).pop() || "project";

    if (!hasMem) {
      return { hasMemory: false, projectName };
    }

    let latestEntry: SessionSummaryEntry | null = null;
    if (existsSync(this.summariesDir)) {
      try {
        const files = readdirSync(this.summariesDir)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .reverse();

        if (files[0]) {
          const raw = readFileSync(join(this.summariesDir, files[0]), "utf-8");
          latestEntry = JSON.parse(raw);
        }
      } catch {}
    }

    return {
      hasMemory: true,
      projectName,
      lastSessionTimestamp: latestEntry?.timestamp,
      lastSummary: latestEntry?.summary || "Previous tasks recorded in .codexa/memory.md",
      filesModified: latestEntry?.filesModified,
      testsPassed: latestEntry?.testsPassed,
      memoryContent: existsSync(this.memoryFile) ? readFileSync(this.memoryFile, "utf-8") : undefined,
    };
  }

  /**
   * Imports memory notes from markdown or JSON file.
   */
  public importMemory(sourcePath: string): { success: boolean; message: string } {
    this.ensureDirs();
    const resolvedSource = resolve(sourcePath);
    if (!existsSync(resolvedSource)) {
      return { success: false, message: `Source file not found: ${sourcePath}` };
    }

    try {
      const raw = readFileSync(resolvedSource, "utf-8");
      let importedMarkdown = raw;

      if (sourcePath.endsWith(".json")) {
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "object" && parsed !== null) {
            importedMarkdown = `# Imported Project Memory\n\n` +
              Object.entries(parsed)
                .map(([k, v]) => `## ${k}\n${typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}`)
                .join("\n\n");
          }
        } catch {}
      }

      const existing = this.getOrInitMemory();
      const merged = `${existing}\n\n<!-- Imported from ${sourcePath} at ${new Date().toISOString()} -->\n${importedMarkdown}`;
      this.saveMemory(merged);

      return { success: true, message: `Imported memory from ${sourcePath} into .codexa/memory.md` };
    } catch (err: any) {
      return { success: false, message: `Failed to import memory: ${err.message}` };
    }
  }

  /**
   * Exports project memory and summaries to a target file.
   */
  public exportMemory(targetPath?: string): { success: boolean; path: string } {
    this.ensureDirs();
    const dest = resolve(targetPath || join(this.cwd, "codexa-memory-export.md"));
    const memory = this.getOrInitMemory();

    let exportContent = `# CodeXA Project Memory Export: ${this.cwd.split(/[/\\]/).pop()}\nGenerated: ${new Date().toISOString()}\n\n${memory}\n\n## Session History Archive\n`;

    if (existsSync(this.summariesDir)) {
      const files = readdirSync(this.summariesDir).filter((f) => f.endsWith(".json")).sort();
      for (const file of files) {
        try {
          const item: SessionSummaryEntry = JSON.parse(readFileSync(join(this.summariesDir, file), "utf-8"));
          exportContent += `\n### Session ${item.sessionId.slice(0, 8)} (${new Date(item.timestamp).toLocaleString()})\n- **Task**: ${item.task}\n- **Summary**: ${item.summary}\n- **Files**: ${item.filesModified.join(", ") || "None"}\n`;
        } catch {}
      }
    }

    writeFileSync(dest, exportContent, "utf-8");
    return { success: true, path: dest };
  }

  /**
   * Save cached project knowledge graph map.
   */
  public saveProjectMap(graph: Partial<ProjectKnowledgeGraph>): void {
    this.ensureDirs();
    writeFileSync(this.projectMapFile, JSON.stringify(graph, null, 2), "utf-8");
  }

  /**
   * Get cached project knowledge graph map.
   */
  public getProjectMap(): Partial<ProjectKnowledgeGraph> | null {
    try {
      if (!existsSync(this.projectMapFile)) return null;
      return JSON.parse(readFileSync(this.projectMapFile, "utf-8"));
    } catch {
      return null;
    }
  }

  /**
   * Clear or reset project memory.
   */
  public clearMemory(): void {
    if (existsSync(this.memoryFile)) {
      try { unlinkSync(this.memoryFile); } catch {}
    }
    if (existsSync(this.projectMapFile)) {
      try { unlinkSync(this.projectMapFile); } catch {}
    }
  }
}

