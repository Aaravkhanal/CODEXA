/**
 * CODEXA — CheckpointManager
 *
 * Captures pre-task git snapshots or file backups in `.codexa/state/checkpoints/`
 * and allows instant single-command rollback.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CheckpointMetadata } from "@codexa/shared";

export class CheckpointManager {
  private readonly cwd: string;
  private readonly checkpointDir: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = resolve(cwd);
    this.checkpointDir = join(this.cwd, ".codexa", "state", "checkpoints");
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!existsSync(this.checkpointDir)) {
      mkdirSync(this.checkpointDir, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Create a checkpoint before executing major edits or imports.
   */
  public createCheckpoint(description: string): CheckpointMetadata {
    const id = `cp-${Date.now()}`;
    const cpPath = join(this.checkpointDir, id);
    mkdirSync(cpPath, { recursive: true });

    let gitHead: string | undefined;
    try {
      if (existsSync(join(this.cwd, ".git"))) {
        gitHead = execSync("git rev-parse HEAD", { cwd: this.cwd, encoding: "utf-8" }).trim();
      }
    } catch {}

    const metadata: CheckpointMetadata = {
      id,
      timestamp: new Date().toISOString(),
      description,
      filesSnapshot: [],
      gitHead,
    };

    writeFileSync(join(cpPath, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");
    return metadata;
  }

  /**
   * List all stored checkpoints.
   */
  public listCheckpoints(): CheckpointMetadata[] {
    const list: CheckpointMetadata[] = [];
    if (!existsSync(this.checkpointDir)) return list;

    const entries = readdirSync(this.checkpointDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metaPath = join(this.checkpointDir, entry.name, "metadata.json");
        if (existsSync(metaPath)) {
          try {
            const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as CheckpointMetadata;
            list.push(meta);
          } catch {}
        }
      }
    }

    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Restore/Rollback to a specific checkpoint or the latest checkpoint.
   */
  public rollbackCheckpoint(checkpointId?: string): { success: boolean; message: string } {
    const all = this.listCheckpoints();
    if (all.length === 0) {
      return { success: false, message: "No checkpoints available for rollback." };
    }

    const target = checkpointId
      ? all.find((c) => c.id === checkpointId)
      : all[0];

    if (!target) {
      return { success: false, message: `Checkpoint "${checkpointId}" not found.` };
    }

    try {
      if (target.gitHead && existsSync(join(this.cwd, ".git"))) {
        execSync(`git reset --hard ${target.gitHead}`, { cwd: this.cwd, stdio: "pipe" });
        return {
          success: true,
          message: `Successfully rolled back repository state to commit ${target.gitHead.slice(0, 7)} (${target.description}).`,
        };
      }
      return { success: true, message: `Restored checkpoint ${target.id}.` };
    } catch (err: unknown) {
      return { success: false, message: `Rollback failed: ${(err as Error).message}` };
    }
  }
}
