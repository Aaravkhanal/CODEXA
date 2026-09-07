/**
 * CODEXA `codexa repo` command handler
 */

import { GitHubManager } from "@codexa/agent";

export async function runRepoCommand(subcommand = "analyze", subArgs: string[] = []): Promise<void> {
  const manager = new GitHubManager(process.cwd());
  const url = subArgs[0];

  if (!url && subcommand !== "list") {
    console.log("Usage: codexa repo <analyze|clone|fork|import> <url>");
    return;
  }

  const targetUrl = url || "";

  switch (subcommand) {
    case "analyze": {
      console.log(`\n🔍 Analyzing repository: ${targetUrl}...`);
      const analysis = manager.analyzeRepository(targetUrl);
      console.log(`\nRepository: ${analysis.name}`);
      console.log(`Framework:  ${analysis.framework}`);
      console.log(`Language:   ${analysis.language}`);
      console.log(`Package Manager: ${analysis.packageManager}`);
      console.log(`License:    ${analysis.license}`);
      console.log(`Dependencies: ${analysis.dependencies.slice(0, 10).join(", ")}`);
      console.log(`Integration points: ${analysis.integrationPoints.join(", ")}\n`);
      break;
    }
    case "clone": {
      console.log(`\n📥 Cloning repository: ${targetUrl}...`);
      const { localPath, analysis } = manager.cloneRepository({ url: targetUrl });
      console.log(`✓ Cloned ${analysis.name} to ${localPath}\n`);
      break;
    }
    case "fork": {
      console.log(`\n🍴 Forking repository: ${targetUrl}...`);
      try {
        const res = await manager.forkRepository(targetUrl);
        console.log(`✓ Forked repository successfully: ${res}\n`);
      } catch (err: unknown) {
        console.error(`✗ ${(err as Error).message}\n`);
      }
      break;
    }
    default: {
      console.log("Usage: codexa repo <analyze|clone|fork|import> <url>");
    }
  }
}
