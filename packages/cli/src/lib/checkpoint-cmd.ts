/**
 * CODEXA `codexa checkpoints` command handler
 */

import { CheckpointManager } from "@codexa/agent";

export async function runCheckpointCommand(subcommand = "list", subArgs: string[] = []): Promise<void> {
  const manager = new CheckpointManager(process.cwd());

  switch (subcommand) {
    case "list":
    case "ls": {
      const cps = manager.listCheckpoints();
      console.log("\n🛡 CODEXA Project Checkpoints:\n");
      if (cps.length === 0) {
        console.log("  No checkpoints created yet.");
      } else {
        cps.forEach((c) => {
          console.log(`  • ${c.id} [${c.timestamp.slice(0, 16)}] - ${c.description}`);
        });
      }
      console.log();
      break;
    }
    case "rollback":
    case "restore": {
      const targetId = subArgs[0];
      console.log(`\n↺ Rolling back checkpoint...`);
      const res = manager.rollbackCheckpoint(targetId);
      if (res.success) console.log(`✓ ${res.message}\n`);
      else console.log(`✗ ${res.message}\n`);
      break;
    }
    default: {
      console.log("Usage: codexa checkpoints [list|rollback [id]]");
    }
  }
}
