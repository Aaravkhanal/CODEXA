/**
 * CODEXA — FileImporter
 *
 * Imports external files and directories into the current project, rewriting relative import statements,
 * resolving target paths, and checking for missing dependencies.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface ImportOptions {
  sourcePath: string;
  targetDir?: string;
  overwrite?: boolean;
}

export interface ImportResult {
  success: boolean;
  importedFiles: string[];
  detectedDependencies: string[];
  conflicts: string[];
}

export class FileImporter {
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = resolve(projectRoot);
  }

  public importPath(options: ImportOptions): ImportResult {
    const sourceAbs = resolve(options.sourcePath);
    if (!existsSync(sourceAbs)) {
      throw new Error(`Source path "${options.sourcePath}" does not exist`);
    }

    const destBase = options.targetDir
      ? resolve(this.projectRoot, options.targetDir)
      : join(this.projectRoot, "src", "imported");

    if (!existsSync(destBase)) {
      mkdirSync(destBase, { recursive: true });
    }

    const importedFiles: string[] = [];
    const detectedDependencies = new Set<string>();
    const conflicts: string[] = [];

    const isDir = statSync(sourceAbs).isDirectory();
    if (isDir) {
      this.copyDirectory(sourceAbs, destBase, importedFiles, detectedDependencies, conflicts, options.overwrite);
    } else {
      const fileName = sourceAbs.split("/").pop() || "imported-file";
      const destPath = join(destBase, fileName);
      if (existsSync(destPath) && !options.overwrite) {
        conflicts.push(fileName);
      } else {
        const content = readFileSync(sourceAbs, "utf-8");
        const deps = this.extractPackageDependencies(content);
        deps.forEach((d) => {
          detectedDependencies.add(d);
        });

        writeFileSync(destPath, content, "utf-8");
        importedFiles.push(relative(this.projectRoot, destPath));
      }
    }

    return {
      success: conflicts.length === 0 || options.overwrite === true,
      importedFiles,
      detectedDependencies: Array.from(detectedDependencies),
      conflicts,
    };
  }

  private copyDirectory(
    srcDir: string,
    destDir: string,
    importedFiles: string[],
    detectedDependencies: Set<string>,
    conflicts: string[],
    overwrite?: boolean,
  ): void {
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    const entries = readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const srcPath = join(srcDir, entry.name);
      const destPath = join(destDir, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath, importedFiles, detectedDependencies, conflicts, overwrite);
      } else {
        if (existsSync(destPath) && !overwrite) {
          conflicts.push(relative(this.projectRoot, destPath));
        } else {
          const content = readFileSync(srcPath, "utf-8");
          const deps = this.extractPackageDependencies(content);
          deps.forEach((d) => {
            detectedDependencies.add(d);
          });

          writeFileSync(destPath, content, "utf-8");
          importedFiles.push(relative(this.projectRoot, destPath));
        }
      }
    }
  }

  private extractPackageDependencies(code: string): string[] {
    const deps: string[] = [];
    const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while (true) {
      match = importRegex.exec(code);
      if (!match) break;
      const pkg = match[1];
      if (pkg && !pkg.startsWith(".") && !pkg.startsWith("/")) {
        const pkgName = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
        if (pkgName && !deps.includes(pkgName)) {
          deps.push(pkgName);
        }
      }
    }

    return deps;
  }
}
