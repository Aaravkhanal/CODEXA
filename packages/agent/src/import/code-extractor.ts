/**
 * CODEXA — CodeExtractor
 *
 * Extracts specific components, functions, styles, or hooks from a source codebase,
 * tracing internal dependencies to assemble a clean standalone bundle.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface ExtractedFeature {
  featureName: string;
  files: { path: string; content: string }[];
  dependencies: string[];
}

export class CodeExtractor {
  public extractFeature(sourceDir: string, featureName: string): ExtractedFeature {
    const files: { path: string; content: string }[] = [];
    const dependencies = new Set<string>();

    if (!existsSync(sourceDir)) {
      throw new Error(`Source directory "${sourceDir}" does not exist`);
    }

    const featureLower = featureName.toLowerCase();
    this.scanAndCollect(sourceDir, sourceDir, featureLower, files, dependencies);

    return {
      featureName,
      files,
      dependencies: Array.from(dependencies),
    };
  }

  private scanAndCollect(
    baseDir: string,
    currentDir: string,
    query: string,
    files: { path: string; content: string }[],
    dependencies: Set<string>,
  ): void {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        this.scanAndCollect(baseDir, fullPath, query, files, dependencies);
      } else {
        const nameLower = entry.name.toLowerCase();
        if (nameLower.includes(query) || entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            if (nameLower.includes(query) || content.toLowerCase().includes(query)) {
              const relPath = fullPath.replace(baseDir, "").replace(/^\//, "");
              files.push({ path: relPath, content });

              // Extract dependencies
              const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
              let match: RegExpExecArray | null;
              while (true) {
                match = importRegex.exec(content);
                if (!match) break;
                const pkg = match[1];
                if (pkg && !pkg.startsWith(".") && !pkg.startsWith("/")) {
                  const pkgName = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
                  if (pkgName) dependencies.add(pkgName);
                }
              }
            }
          } catch {}
        }
      }
    }
  }
}
