/**
 * CODEXA `codexa skill` command handler
 */

import { SkillInstaller, SkillManager } from "@codexa/agent";

export async function runSkillCommand(subcommand = "list", subArgs: string[] = []): Promise<void> {
  const manager = new SkillManager(process.cwd());
  const installer = new SkillInstaller(process.cwd() + "/.codexa/skills");

  switch (subcommand) {
    case "list":
    case "ls": {
      const skills = manager.listSkills();
      console.log("\n📦 CODEXA Installed Skills:\n");
      if (skills.length === 0) {
        console.log("  No skills installed yet. Install one with: codexa skill install <name>");
      } else {
        skills.forEach((s) => {
          const type = s.isProjectSkill ? "[Project]" : "[Global]";
          console.log(`  • ${s.name} ${type} - ${s.description}`);
        });
      }
      console.log();
      break;
    }
    case "install":
    case "add": {
      const target = subArgs[0];
      if (!target) {
        console.log("Usage: codexa skill install <skill-name>");
        return;
      }
      console.log(`\n📥 Installing skill "${target}"...`);
      const installed = installer.installSkill(target);
      console.log(`✓ Skill "${installed.name}" installed successfully to .codexa/skills/${installed.name}/\n`);
      break;
    }
    case "create": {
      const name = subArgs[0] || "project-architecture";
      console.log(`\n🏗 Creating project skill "${name}"...`);
      const created = manager.createProjectSkill(name, "Project-specific architecture & conventions skill");
      console.log(`✓ Created skill "${created.name}" in .codexa/skills/${created.name}/SKILL.md\n`);
      break;
    }
    case "remove":
    case "rm": {
      const target = subArgs[0];
      if (!target) {
        console.log("Usage: codexa skill remove <skill-name>");
        return;
      }
      const success = manager.removeSkill(target);
      if (success) console.log(`✓ Skill "${target}" removed.`);
      else console.log(`✗ Skill "${target}" not found.`);
      break;
    }
    default: {
      console.log("Usage: codexa skill [list|install|create|remove] [args]");
    }
  }
}
