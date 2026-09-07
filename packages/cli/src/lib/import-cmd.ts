/**
 * CODEXA `codexa import` command handler
 */

import { DependencyManager, FileImporter } from "@codexa/agent";

export async function runImportCommand(targetPath?: string, subArgs: string[] = []): Promise<void> {
  const source = targetPath || subArgs[0];
  if (!source) {
    console.log("Usage: codexa import <file-or-folder-path>");
    return;
  }

  console.log(`\n📥 Importing "${source}" into project...`);
  const importer = new FileImporter(process.cwd());
  const res = importer.importPath({ sourcePath: source });

  console.log(`✓ Imported ${res.importedFiles.length} file(s).`);

  if (res.detectedDependencies.length > 0) {
    console.log(`\nDetected dependencies: ${res.detectedDependencies.join(", ")}`);
    console.log("Checking project dependency status...");

    const depManager = new DependencyManager(process.cwd());
    const installRes = depManager.installMissing(res.detectedDependencies);
    if (installRes.installed.length > 0) {
      console.log(`✓ Installed missing dependencies: ${installRes.installed.join(", ")}`);
    } else {
      console.log(`✓ All required dependencies are already present.`);
    }
  }

  console.log();
}
