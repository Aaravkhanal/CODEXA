/**
 * CODEXA — Recent Projects Manager
 *
 * Tracks and persists recently accessed project paths in `~/.codexa/recents.json`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectProject } from "./project-detector";
import { getCodexaDir } from "./global-config";

export interface RecentProjectEntry {
  path: string;
  name: string;
  languages: string[];
  frameworks: string[];
  lastOpened: number; // timestamp ms
}

const MAX_RECENT_PROJECTS = 10;

function getRecentsFile(): string {
  return join(getCodexaDir(), "recents.json");
}

function ensureGlobalDir(): void {
  const codexaDir = getCodexaDir();
  if (!existsSync(codexaDir)) {
    mkdirSync(codexaDir, { recursive: true, mode: 0o700 });
  }
}

export function getRecentProjects(): RecentProjectEntry[] {
  try {
    const recentsFile = getRecentsFile();
    if (!existsSync(recentsFile)) return [];
    const content = readFileSync(recentsFile, "utf-8");
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
    writeFileSync(getRecentsFile(), JSON.stringify(updated, null, 2), { mode: 0o600 });
    return updated;
  } catch {
    return [];
  }
}

export function clearRecentProjects(): void {
  try {
    ensureGlobalDir();
    writeFileSync(getRecentsFile(), JSON.stringify([], null, 2), { mode: 0o600 });
  } catch {}
}
