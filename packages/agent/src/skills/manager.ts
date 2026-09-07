/**
 * CODEXA — SkillManager
 *
 * Discovers, loads, creates, and installs reusable capabilities (Skills)
 * stored in `.codexa/skills/` (project-level) and `~/.codexa/skills/` (global).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SkillManifest } from "@codexa/shared";

export class SkillManager {
  private readonly cwd: string;
  private readonly projectSkillsDir: string;
  private readonly globalSkillsDir: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = resolve(cwd);
    this.projectSkillsDir = join(this.cwd, ".codexa", "skills");
    this.globalSkillsDir = join(homedir(), ".codexa", "skills");
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!existsSync(this.projectSkillsDir)) {
      mkdirSync(this.projectSkillsDir, { recursive: true, mode: 0o755 });
    }
    if (!existsSync(this.globalSkillsDir)) {
      mkdirSync(this.globalSkillsDir, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * List all available skills across project and global directories.
   */
  public listSkills(): SkillManifest[] {
    const skills: SkillManifest[] = [];
    const seen = new Set<string>();

    // 1. Scan project-specific skills first (higher priority)
    if (existsSync(this.projectSkillsDir)) {
      for (const entry of readdirSync(this.projectSkillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const manifest = this.loadSkillManifest(join(this.projectSkillsDir, entry.name), true);
          if (manifest) {
            skills.push(manifest);
            seen.add(manifest.name.toLowerCase());
          }
        }
      }
    }

    // 2. Scan global skills
    if (existsSync(this.globalSkillsDir)) {
      for (const entry of readdirSync(this.globalSkillsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !seen.has(entry.name.toLowerCase())) {
          const manifest = this.loadSkillManifest(join(this.globalSkillsDir, entry.name), false);
          if (manifest) {
            skills.push(manifest);
          }
        }
      }
    }

    return skills;
  }

  /**
   * Load a single skill by name.
   */
  public getSkill(name: string): SkillManifest | null {
    const all = this.listSkills();
    return all.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  /**
   * Automatically detect required skills from a task prompt.
   */
  public detectSkillsForTask(taskPrompt: string): SkillManifest[] {
    const promptLower = taskPrompt.toLowerCase();
    const allSkills = this.listSkills();
    const matched: SkillManifest[] = [];

    for (const skill of allSkills) {
      let isMatch = false;
      if (promptLower.includes(skill.name.toLowerCase())) {
        isMatch = true;
      } else {
        for (const trigger of skill.whenToUse) {
          if (promptLower.includes(trigger.toLowerCase())) {
            isMatch = true;
            break;
          }
        }
      }
      if (isMatch) {
        matched.push(skill);
      }
    }

    return matched;
  }

  /**
   * Create a project-specific skill from prompt or project analysis.
   */
  public createProjectSkill(
    name: string,
    description: string,
    whenToUse: string[] = [],
    workflow: string[] = [],
  ): SkillManifest {
    const skillName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const skillDir = join(this.projectSkillsDir, skillName);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    const manifest: SkillManifest = {
      name: skillName,
      version: "1.0.0",
      description,
      whenToUse: whenToUse.length > 0 ? whenToUse : [name, "project architecture"],
      requiredTools: ["readFile", "editFile", "bash"],
      recommendedWorkflow: workflow.length > 0 ? workflow : ["Inspect project structure", "Follow conventions"],
      constraints: ["Respect existing architecture and styling"],
      examples: [
        {
          title: `Use ${skillName}`,
          prompt: `Follow ${skillName} conventions for new features`,
        },
      ],
      commonErrors: [
        {
          error: "Style mismatch",
          recovery: "Check existing components for styling conventions",
        },
      ],
      sourcePath: skillDir,
      isProjectSkill: true,
    };

    const markdownContent = `# ${manifest.name}\n\n${manifest.description}\n\n## When To Use\n${manifest.whenToUse.map((w) => `- ${w}`).join("\n")}\n\n## Workflow\n${manifest.recommendedWorkflow.map((w, i) => `${i + 1}. ${w}`).join("\n")}\n`;
    writeFileSync(join(skillDir, "SKILL.md"), markdownContent, "utf-8");

    return manifest;
  }

  /**
   * Remove a skill by name.
   */
  public removeSkill(name: string): boolean {
    const skillName = name.toLowerCase();
    const projPath = join(this.projectSkillsDir, skillName);
    const globPath = join(this.globalSkillsDir, skillName);

    let removed = false;
    if (existsSync(projPath)) {
      rmSync(projPath, { recursive: true, force: true });
      removed = true;
    }
    if (existsSync(globPath)) {
      rmSync(globPath, { recursive: true, force: true });
      removed = true;
    }
    return removed;
  }

  private loadSkillManifest(dirPath: string, isProject: boolean): SkillManifest | null {
    const skillFile = join(dirPath, "SKILL.md");
    if (!existsSync(skillFile)) return null;

    try {
      const content = readFileSync(skillFile, "utf-8");
      const lines = content.split("\n");
      const title = lines.find((l) => l.startsWith("# "))?.replace(/^#\s+/, "").trim() || dirPath.split("/").pop() || "unknown";
      
      const whenToUse: string[] = [];
      let inWhenToUse = false;

      for (const line of lines) {
        if (line.toLowerCase().includes("when to use")) {
          inWhenToUse = true;
          continue;
        }
        if (inWhenToUse && line.startsWith("#")) {
          inWhenToUse = false;
        }
        if (inWhenToUse && line.trim().startsWith("- ")) {
          whenToUse.push(line.trim().slice(2));
        }
      }

      return {
        name: title.toLowerCase(),
        version: "1.0.0",
        description: lines.find((l) => l.trim().length > 0 && !l.startsWith("#")) || "Project skill",
        whenToUse: whenToUse.length > 0 ? whenToUse : [title.toLowerCase()],
        requiredTools: ["readFile", "editFile", "bash"],
        recommendedWorkflow: ["Follow skill instructions"],
        constraints: [],
        examples: [],
        commonErrors: [],
        sourcePath: dirPath,
        isProjectSkill: isProject,
      };
    } catch {
      return null;
    }
  }
}
