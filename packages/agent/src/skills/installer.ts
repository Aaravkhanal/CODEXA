/**
 * CODEXA — SkillInstaller
 *
 * Dynamically installs skills into `.codexa/skills/` from templates, GitHub sources, or local paths.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillManifest } from "@codexa/shared";

const BUILTIN_SKILL_TEMPLATES: Record<string, Partial<SkillManifest>> = {
  react: {
    name: "react",
    description: "Best practices for React components, hooks, state management, and JSX rendering.",
    whenToUse: ["react", "jsx", "tsx", "component", "hook", "useeffect", "usestate"],
    requiredTools: ["readFile", "editFile", "bash"],
    recommendedWorkflow: [
      "Keep components functional and modular",
      "Use TypeScript props interfaces",
      "Avoid direct DOM mutations",
    ],
    constraints: ["Follow existing component directory conventions"],
  },
  nextjs: {
    name: "nextjs",
    description: "Next.js App Router, Server Components, API Routes, and SSR/SSG patterns.",
    whenToUse: ["next", "nextjs", "app router", "server component", "page.tsx", "layout.tsx"],
    requiredTools: ["readFile", "editFile", "bash"],
    recommendedWorkflow: [
      "Prefer Server Components by default",
      "Use 'use client' directive explicitly when using interactive hooks",
    ],
    constraints: ["Route files belong in app/ directory"],
  },
  testing: {
    name: "testing",
    description: "Unit, integration, and E2E test setup, mocking, assertions, and runner execution.",
    whenToUse: ["test", "jest", "vitest", "pytest", "bun test", "spec", "coverage"],
    requiredTools: ["readFile", "editFile", "bash"],
    recommendedWorkflow: [
      "Write isolated unit tests for core utilities",
      "Mock network calls and third-party APIs",
    ],
    constraints: ["Run full test suite before completing task"],
  },
  docker: {
    name: "docker",
    description: "Containerization, Dockerfile generation, docker-compose configuration, and multi-stage builds.",
    whenToUse: ["docker", "dockerfile", "container", "compose", "docker-compose"],
    requiredTools: ["readFile", "editFile", "bash"],
    recommendedWorkflow: [
      "Use lightweight base images (alpine/slim)",
      "Multi-stage builds for production binaries",
    ],
    constraints: ["Do not expose sensitive secrets in Dockerfiles"],
  },
  github: {
    name: "github",
    description: "Git & GitHub operations, repository cloning, forking, PR creation, and issue management.",
    whenToUse: ["git", "github", "repo", "clone", "fork", "pull request", "branch"],
    requiredTools: ["readFile", "editFile", "bash"],
    recommendedWorkflow: [
      "Inspect diff before committing",
      "Generate clean semantic commit messages",
    ],
    constraints: ["Always confirm dangerous git resets or force pushes"],
  },
};

export class SkillInstaller {
  private readonly targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  public installSkill(skillNameOrSource: string): SkillManifest {
    const name = skillNameOrSource.toLowerCase().trim();
    const destDir = join(this.targetDir, name);

    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    const template = BUILTIN_SKILL_TEMPLATES[name] ?? {
      name,
      description: `Installed skill for ${name}`,
      whenToUse: [name],
      requiredTools: ["readFile", "editFile", "bash"],
      recommendedWorkflow: [`Implement ${name} tasks adhering to project conventions`],
      constraints: [],
    };

    const manifest: SkillManifest = {
      name,
      version: "1.0.0",
      description: template.description ?? `Capability for ${name}`,
      whenToUse: template.whenToUse ?? [name],
      requiredTools: template.requiredTools ?? ["readFile", "editFile", "bash"],
      recommendedWorkflow: template.recommendedWorkflow ?? [],
      constraints: template.constraints ?? [],
      examples: template.examples ?? [],
      commonErrors: template.commonErrors ?? [],
      sourcePath: destDir,
      isProjectSkill: true,
    };

    const markdown = `# Skill: ${manifest.name}\n\n${manifest.description}\n\n## When To Use\n${manifest.whenToUse.map((w) => `- ${w}`).join("\n")}\n\n## Workflow\n${manifest.recommendedWorkflow.map((w, i) => `${i + 1}. ${w}`).join("\n")}\n`;
    writeFileSync(join(destDir, "SKILL.md"), markdown, "utf-8");

    return manifest;
  }
}
