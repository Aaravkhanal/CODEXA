import { describe, expect, test } from "bun:test";
import { DependencyManager, FileImporter } from "../src/index.ts";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("File Importer & Dependency Intelligence", () => {
  const testTmp = join(process.cwd(), ".test-import-tmp");

  test("DependencyManager detects missing vs installed packages", () => {
    const depManager = new DependencyManager(process.cwd());
    const plan = depManager.planDependencies(["react", "non-existent-dummy-package-xyz"]);

    expect(plan.packageManager).toBeDefined();
    expect(plan.missing.includes("non-existent-dummy-package-xyz")).toBe(true);
  });

  test("FileImporter copies files and detects required dependencies", () => {
    if (!existsSync(testTmp)) mkdirSync(testTmp, { recursive: true });
    const sampleFile = join(testTmp, "sample.tsx");
    writeFileSync(sampleFile, `import React from "react";\nimport { useState } from "lucide-react";`, "utf-8");

    const importer = new FileImporter(process.cwd());
    const res = importer.importPath({ sourcePath: sampleFile, targetDir: ".test-import-dest" });

    expect(res.importedFiles.length).toBe(1);
    expect(res.detectedDependencies.includes("react") || res.detectedDependencies.includes("lucide-react")).toBe(true);

    rmSync(testTmp, { recursive: true, force: true });
    rmSync(join(process.cwd(), ".test-import-dest"), { recursive: true, force: true });
  });
});
