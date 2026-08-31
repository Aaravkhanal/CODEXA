import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

const SNAPSHOTS_DIR = join(homedir(), ".codexa", "snapshots");

function ensureDirectoryExist(dirPath: string) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

export function saveFileSnapshot(sessionId: string, filePath: string, absolutePath: string): void {
  try {
    ensureDirectoryExist(join(SNAPSHOTS_DIR, sessionId));

    // If file doesn't exist, we save a special marker "DELETE" to represent that it shouldn't exist.
    let content: string;
    let isDeletedMarker = false;

    if (existsSync(absolutePath)) {
      content = readFileSync(absolutePath, "utf-8");
    } else {
      content = "";
      isDeletedMarker = true;
    }

    const timestamp = Date.now();
    // Encode filename to be safe for filesystem
    const safeFilePath = Buffer.from(filePath).toString("hex");
    const snapshotPath = join(SNAPSHOTS_DIR, sessionId, `${timestamp}_${safeFilePath}.bak`);

    const data = {
      filePath,
      isDeletedMarker,
      content,
    };

    writeFileSync(snapshotPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`[CODEXA] Failed to save snapshot for ${filePath}:`, error);
  }
}

export function undoLastSnapshotSet(sessionId: string, cwd: string = process.cwd()): string[] {
  const sessionDir = join(SNAPSHOTS_DIR, sessionId);
  if (!existsSync(sessionDir)) {
    return [];
  }

  try {
    const files = readdirSync(sessionDir)
      .filter((f) => f.endsWith(".bak"))
      .sort((a, b) => {
        const timeA = Number(a.split("_")[0]);
        const timeB = Number(b.split("_")[0]);
        return timeB - timeA; // Descending order (latest first)
      });

    if (files.length === 0) {
      return [];
    }

    // Group snapshots by timestamp to revert all changes that happened in the same turn/tool-execution
    const latestFile = files[0]!;
    const latestTimestamp = latestFile.split("_")[0]!;

    const turnFiles = files.filter((f) => f.startsWith(latestTimestamp));
    const restoredPaths: string[] = [];

    for (const file of turnFiles) {
      const snapshotPath = join(sessionDir, file);
      const raw = readFileSync(snapshotPath, "utf-8");
      const { filePath, isDeletedMarker, content } = JSON.parse(raw);

      const absoluteTarget = join(cwd, filePath);

      // Prefer git checkout if it's a git repo and the file is tracked
      let restoredViaGit = false;
      const gitDir = join(cwd, ".git");
      if (existsSync(gitDir)) {
        try {
          execSync(`git checkout -- "${filePath}"`, { cwd, stdio: "ignore" });
          restoredViaGit = true;
          restoredPaths.push(filePath);
        } catch {
          // Fall back to manual restore
        }
      }

      if (!restoredViaGit) {
        ensureDirectoryExist(dirname(absoluteTarget));
        if (isDeletedMarker) {
          if (existsSync(absoluteTarget)) {
            unlinkSync(absoluteTarget);
          }
        } else {
          writeFileSync(absoluteTarget, content, "utf-8");
        }
        restoredPaths.push(filePath);
      }

      // Delete snapshot file after restore
      unlinkSync(snapshotPath);
    }

    return restoredPaths;
  } catch (error) {
    console.error(`[CODEXA] Failed to undo last snapshot:`, error);
    return [];
  }
}

export function cleanOldSnapshots(maxAgeDays: number = 7): void {
  try {
    if (!existsSync(SNAPSHOTS_DIR)) return;

    const sessions = readdirSync(SNAPSHOTS_DIR);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    for (const session of sessions) {
      const sessionDir = join(SNAPSHOTS_DIR, session);
      if (!statSync(sessionDir).isDirectory()) continue;

      const files = readdirSync(sessionDir);
      let sessionEmpty = true;

      for (const file of files) {
        const filePath = join(sessionDir, file);
        const stats = statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          unlinkSync(filePath);
        } else {
          sessionEmpty = false;
        }
      }

      if (sessionEmpty) {
        // Clean up empty directories
        try {
          unlinkSync(sessionDir);
        } catch {
          // May fail if other processes wrote to it
        }
      }
    }
  } catch (error) {
    console.error("[CODEXA] Failed cleaning old snapshots:", error);
  }
}
