/**
 * CODEXA — Recent Projects Manager
 *
 * Tracks and persists recently accessed project paths in `~/.codexa/recents.json`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { detectProject } from "./project-detector";

export interface RecentProjectEntry {
  path: string;
  name: string;
  languages: string[];
  frameworks: string[];
  lastOpened: number; // timestamp ms
}

const GLOBAL_CODEXA_DIR = join(homedir(), ".codexa");
const RECENTS_FILE = join(GLOBAL_CODEXA_DIR, "recents.json");
const MAX_RECENT_PROJECTS = 10;

function ensureGlobalDir(): void {
  if (!existsSync(GLOBAL_CODEXA_DIR)) {
    mkdirSync(GLOBAL_CODEXA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function getRecentProjects(): RecentProjectEntry[] {
  try {
    if (!existsSync(RECENTS_FILE)) return [];
    const content = readFileSync(RECENTS_FILE, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item?.path === "string" && existsSync(item.path));
  } catch {
    return [];
  }
}

export function addRecentProject(projectPath: string): RecentProjectEntry[] {
  try {
    ensureGlobalDir();
    const resolvedPath = resolve(projectPath);
    const info = detectProject(resolvedPath);
    const existing = getRecentProjects().filter((p) => resolve(p.path) !== resolvedPath);

    const newEntry: RecentProjectEntry = {
      path: resolvedPath,
      name: info.name,
      languages: info.languages,
      frameworks: info.frameworks,
      lastOpened: Date.now(),
    };

    const updated = [newEntry, ...existing].slice(0, MAX_RECENT_PROJECTS);
    writeFileSync(RECENTS_FILE, JSON.stringify(updated, null, 2), { mode: 0o600 });
    return updated;
  } catch {
    return [];
  }
}

export function clearRecentProjects(): void {
  try {
    ensureGlobalDir();
    writeFileSync(RECENTS_FILE, JSON.stringify([], null, 2), { mode: 0o600 });
  } catch {}
}
