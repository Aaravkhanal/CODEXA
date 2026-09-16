import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { getCodexaDir } from "./global-config";

function snapshotsDir(): string {
  return join(getCodexaDir(), "snapshots");
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath !== "" && !relativePath.startsWith("..") && !relativePath.includes(`${String.fromCharCode(0)}`);
}

function getSessionDir(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error("Invalid snapshot session ID");
  }
  return join(snapshotsDir(), sessionId);
}

function getProjectPath(cwd: string, filePath: unknown): string | null {
  if (typeof filePath !== "string" || !filePath || filePath.includes("\0")) return null;
  const projectRoot = resolve(cwd);
  const target = resolve(projectRoot, filePath);
  return isPathInside(projectRoot, target) ? target : null;
}

function ensureDirectoryExist(dirPath: string) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

export function saveFileSnapshot(sessionId: string, filePath: string, absolutePath: string): void {
  try {
    const sessionDir = getSessionDir(sessionId);
    ensureDirectoryExist(sessionDir);

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
    const snapshotPath = join(sessionDir, `${timestamp}_${safeFilePath}.bak`);

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
  let sessionDir: string;
  try {
    sessionDir = getSessionDir(sessionId);
  } catch {
    return [];
  }
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
      const { filePath, isDeletedMarker, content } = JSON.parse(raw) as {
        filePath?: unknown;
        isDeletedMarker?: unknown;
        content?: unknown;
      };

      const snapshotFilePath = typeof filePath === "string" ? filePath : null;
      const absoluteTarget = getProjectPath(cwd, snapshotFilePath);
      if (!snapshotFilePath || !absoluteTarget || typeof content !== "string") continue;

      // Prefer git checkout if it's a git repo and the file is tracked
      let restoredViaGit = false;
      const gitDir = join(cwd, ".git");
      if (existsSync(gitDir)) {
        try {
          execFileSync("git", ["checkout", "--", snapshotFilePath], { cwd, stdio: "ignore" });
          restoredViaGit = true;
          restoredPaths.push(snapshotFilePath);
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
        restoredPaths.push(snapshotFilePath);
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
    const root = snapshotsDir();
    if (!existsSync(root)) return;

    const sessions = readdirSync(root);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    for (const session of sessions) {
      const sessionDir = join(root, session);
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
