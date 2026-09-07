import { describe, expect, test } from "bun:test";
import { SkillInstaller, SkillManager } from "../src/index.ts";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("Codexa Skills Architecture", () => {
  const testCwd = join(process.cwd(), ".test-skills-tmp");

  test("SkillInstaller creates skill directory and SKILL.md manifest", () => {
    const installer = new SkillInstaller(testCwd);
    const manifest = installer.installSkill("react");

    expect(manifest.name).toBe("react");
    expect(existsSync(join(testCwd, "react", "SKILL.md"))).toBe(true);
    rmSync(testCwd, { recursive: true, force: true });
  });

  test("SkillManager lists installed skills and detects matching skills from task prompts", () => {
    const manager = new SkillManager(process.cwd());
    const skills = manager.listSkills();
    expect(Array.isArray(skills)).toBe(true);

    const detected = manager.detectSkillsForTask("Build a new React dashboard component with Next.js");
    expect(Array.isArray(detected)).toBe(true);
  });
});
