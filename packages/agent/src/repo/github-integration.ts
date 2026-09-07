/**
 * CODEXA — GitHub Integration & Repository Manager
 *
 * Provides functionality to clone, fork, import, and integrate external GitHub repositories.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RepositoryAnalysis } from "@codexa/shared";
import { RepoAnalyzer } from "./repo-analyzer";

export interface RepoCloneOptions {
  url: string;
  targetDir?: string;
  forkFirst?: boolean;
}

export class GitHubManager {
  private readonly cwd: string;
  private readonly repoCacheDir: string;
  private readonly analyzer: RepoAnalyzer;

  constructor(cwd: string = process.cwd()) {
    this.cwd = resolve(cwd);
    this.repoCacheDir = join(this.cwd, ".codexa", "cache", "repos");
    this.analyzer = new RepoAnalyzer();
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!existsSync(this.repoCacheDir)) {
      mkdirSync(this.repoCacheDir, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Fork a repository under the user's authenticated GitHub account using gh CLI or git API.
   */
  public async forkRepository(repoUrl: string): Promise<string> {
    try {
      // Use gh repo fork if available
      const output = execSync(`gh repo fork ${repoUrl} --clone=false`, { encoding: "utf-8" }).trim();
      return output;
    } catch {
      // Fallback message if gh is not authenticated
      throw new Error(`Failed to fork repository ${repoUrl}. Make sure 'gh' CLI is installed and authenticated via 'gh auth login'.`);
    }
  }

  /**
   * Clone a remote repository to local cache or target directory.
   */
  public cloneRepository(options: RepoCloneOptions): { localPath: string; analysis: RepositoryAnalysis } {
    const repoName = options.url.split("/").pop()?.replace(/\.git$/, "") || "cloned-repo";
    const destPath = options.targetDir
      ? resolve(this.cwd, options.targetDir)
      : join(this.repoCacheDir, repoName);

    if (!existsSync(destPath)) {
      execSync(`git clone ${options.url} "${destPath}"`, { stdio: "pipe" });
    }

    const analysis = this.analyzer.analyzeRepository(destPath, options.url);
    return { localPath: destPath, analysis };
  }

  /**
   * Deep analysis of a remote repository by shallow cloning.
   */
  public analyzeRepository(url: string): RepositoryAnalysis {
    const repoName = url.split("/").pop()?.replace(/\.git$/, "") || "temp-repo";
    const tempPath = join(this.repoCacheDir, `temp-${repoName}-${Date.now()}`);

    try {
      execSync(`git clone --depth=1 ${url} "${tempPath}"`, { stdio: "pipe" });
      const analysis = this.analyzer.analyzeRepository(tempPath, url);
      return analysis;
    } finally {
      // Cleanup shallow clone if temp
      try {
        if (existsSync(tempPath)) {
          execSync(`rm -rf "${tempPath}"`, { stdio: "pipe" });
        }
      } catch {}
    }
  }
}
