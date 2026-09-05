/**
 * CODEXA `codexa config` Interactive Menu
 *
 * Full interactive configuration manager accessible via:
 *   codexa config            → interactive menu
 *   codexa config provider   → change provider directly
 *   codexa config model      → change model directly
 *   codexa config reset      → reset all configuration
 */

import * as readline from "node:readline";
import type { ProviderName } from "@codexa/agent";
import {
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_MODELS,
  PROVIDERS_REQUIRING_KEY,
  listOllamaModels,
  isOllamaRunning,
  testProviderConnection,
  type ProviderConfig,
} from "@codexa/agent";
import {
  getGlobalConfig,
  getProfile,
  getAllProfiles,
  getCredentials,
  saveGlobalConfig,
  saveProfile,
  saveCredentials,
  deleteProfile,
  deleteCredentials,
  ensureCodesxaDir,
  isFirstRun,
  CODEXA_DIR,
} from "./global-config.ts";
import { runSetupWizard } from "./setup-wizard.ts";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
};

// ---------------------------------------------------------------------------
// CLI entry points
// ---------------------------------------------------------------------------

export async function runConfigCommand(subcommand?: string): Promise<void> {
  if (isFirstRun()) {
    console.log(
      `${c.yellow}No configuration found. Running setup wizard...${c.reset}\n`,
    );
    await runSetupWizard();
    return;
  }

  switch (subcommand) {
    case "provider":
      return runChangeProvider();
    case "model":
      return runChangeModel();
    case "reset":
      return runResetConfig();
    default:
      return runInteractiveMenu();
  }
}

// ---------------------------------------------------------------------------
// Interactive menu
// ---------------------------------------------------------------------------

async function runInteractiveMenu(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  try {
    while (true) {
      console.clear();
      printConfigHeader();

      console.log(`${c.cyan}${c.bold}Options:${c.reset}\n`);
      console.log("  1. Change provider");
      console.log("  2. Change model");
      console.log("  3. Update API key");
      console.log("  4. Test connection");
      console.log("  5. Manage profiles");
      console.log("  6. View configuration");
      console.log("  7. Reset configuration");
      console.log("  8. Exit\n");

      const choice = (await ask(`${c.white}Choice (1-8): ${c.reset}`)).trim();

      switch (choice) {
        case "1":
          rl.close();
          return runChangeProvider();
        case "2":
          rl.close();
          return runChangeModel();
        case "3":
          rl.close();
          return runUpdateApiKey();
        case "4":
          await runTestConnection(rl);
          break;
        case "5":
          rl.close();
          return runManageProfiles();
        case "6":
          await runViewConfig(rl);
          break;
        case "7":
          rl.close();
          return runResetConfig();
        case "8":
          rl.close();
          return;
        default:
          console.log(`\n${c.red}Invalid choice.${c.reset}\n`);
          await ask("Press Enter to continue...");
      }
    }
  } catch {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

async function runChangeProvider(): Promise<void> {
  await runSetupWizard(true);
}

async function runChangeModel(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  try {
    const config = getGlobalConfig();
    if (!config) { rl.close(); return; }

    const profile = getProfile(config.activeProfile);
    if (!profile) { rl.close(); return; }

    console.log(`\n${c.cyan}${c.bold}Change model for "${profile.name}" profile${c.reset}`);
    console.log(`Current model: ${c.yellow}${profile.model}${c.reset}\n`);

    let models = PROVIDER_MODELS[profile.provider];

    if (profile.provider === "ollama") {
      const ollamaModels = await listOllamaModels(profile.baseUrl);
      if (ollamaModels.length > 0) models = ollamaModels.map((m: { name: string }) => m.name);
    }

    if (models.length > 0) {
      models.forEach((m: string, i: number) => {
        console.log(`  ${i + 1}. ${m}`);
      });
      console.log(`  ${models.length + 1}. Other (enter manually)\n`);

      const answer = (await ask(`${c.white}Select (1-${models.length + 1}): ${c.reset}`)).trim();
      const num = parseInt(answer, 10);

      let newModel: string;
      if (!isNaN(num) && num >= 1 && num <= models.length) {
        newModel = models[num - 1]!;
      } else {
        newModel = (await ask(`${c.white}Enter model ID: ${c.reset}`)).trim();
      }

      if (newModel) {
        saveProfile({ ...profile, model: newModel });
        const creds = getCredentials(profile.name);
        if (creds) saveCredentials(profile.name, { ...creds, model: newModel });
        console.log(`\n${c.green}✓ Model updated to: ${newModel}${c.reset}\n`);
      }
    } else {
      const newModel = (await ask(`${c.white}Enter model ID: ${c.reset}`)).trim();
      if (newModel) {
        saveProfile({ ...profile, model: newModel });
        console.log(`\n${c.green}✓ Model updated to: ${newModel}${c.reset}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

async function runUpdateApiKey(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const config = getGlobalConfig();
    if (!config) { rl.close(); return; }
    const profile = getProfile(config.activeProfile);
    if (!profile) { rl.close(); return; }

    if (!PROVIDERS_REQUIRING_KEY.includes(profile.provider)) {
      console.log(`\n${c.yellow}${PROVIDER_DISPLAY_NAMES[profile.provider]} does not require an API key.${c.reset}\n`);
      rl.close();
      return;
    }

    process.stdout.write(`\n${c.white}Enter new API key for ${PROVIDER_DISPLAY_NAMES[profile.provider]}: ${c.reset}`);
    const apiKey = await readMasked();

    if (apiKey) {
      const creds = getCredentials(profile.name) ?? { provider: profile.provider, model: profile.model };
      saveCredentials(profile.name, { ...creds, apiKey });
      console.log(`\n${c.green}✓ API key updated${c.reset}\n`);
    }
  } finally {
    rl.close();
  }
}

async function runTestConnection(rl: readline.Interface): Promise<void> {
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));
  const config = getGlobalConfig();
  if (!config) return;
  const profile = getProfile(config.activeProfile);
  if (!profile) return;
  const creds = getCredentials(config.activeProfile);

  console.log(`\n${c.dim}Testing connection to ${PROVIDER_DISPLAY_NAMES[profile.provider]} (${profile.model})...${c.reset}`);

  let providerConfig: ProviderConfig;
  if (profile.provider === "ollama") {
    providerConfig = { provider: "ollama", baseUrl: profile.baseUrl, model: profile.model };
  } else if (profile.provider === "custom") {
    providerConfig = {
      provider: "custom",
      baseUrl: creds?.baseUrl ?? profile.baseUrl ?? "",
      apiKey: creds?.apiKey ?? "",
      model: profile.model,
    };
  } else {
    const apiKey =
      creds?.apiKey ??
      process.env[`${profile.provider.toUpperCase()}_API_KEY`] ??
      "";
    providerConfig = { provider: profile.provider, apiKey, model: profile.model } as ProviderConfig;
  }

  const result = await testProviderConnection(providerConfig);

  if (result.success) {
    console.log(`${c.green}✓ Connection successful${result.latencyMs !== undefined ? ` (${result.latencyMs}ms)` : ""}${c.reset}\n`);
  } else {
    console.log(`${c.red}✗ Connection failed: ${result.error}${c.reset}\n`);
  }
  await ask("Press Enter to continue...");
}

async function runViewConfig(rl: readline.Interface): Promise<void> {
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));
  const config = getGlobalConfig();
  if (!config) { await ask("Press Enter..."); return; }

  const profile = getProfile(config.activeProfile);
  const creds = getCredentials(config.activeProfile);
  const allProfiles = getAllProfiles();

  console.log(`\n${c.cyan}${c.bold}Current Configuration${c.reset}\n`);
  console.log(`  Active profile:  ${c.yellow}${config.activeProfile}${c.reset}`);
  console.log(`  Provider:        ${profile ? PROVIDER_DISPLAY_NAMES[profile.provider] : "none"}`);
  console.log(`  Model:           ${profile?.model ?? "none"}`);

  if (creds?.apiKey) {
    const masked = maskKey(creds.apiKey);
    console.log(`  API key:         ${masked}`);
  } else if (profile?.provider === "ollama") {
    console.log(`  API key:         (not required)`);
  }

  if (profile?.baseUrl) {
    console.log(`  Base URL:        ${profile.baseUrl}`);
  }

  console.log(`\n  Config dir:      ${CODEXA_DIR}`);

  if (allProfiles.length > 1) {
    console.log(`\n  All profiles:`);
    for (const p of allProfiles) {
      const marker = p.name === config.activeProfile ? `${c.green}●${c.reset}` : "○";
      console.log(`    ${marker} ${p.name}: ${PROVIDER_DISPLAY_NAMES[p.provider]} / ${p.model}`);
    }
  }

  console.log();
  await ask("Press Enter to continue...");
}

async function runManageProfiles(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  try {
    const config = getGlobalConfig();
    if (!config) return;
    const allProfiles = getAllProfiles();

    console.log(`\n${c.cyan}${c.bold}Profile Management${c.reset}\n`);
    allProfiles.forEach((p, i) => {
      const active = p.name === config.activeProfile ? ` ${c.green}(active)${c.reset}` : "";
      console.log(`  ${i + 1}. ${p.name}${active}: ${PROVIDER_DISPLAY_NAMES[p.provider]} / ${p.model}`);
    });

    console.log("\n  a. Add new profile");
    console.log("  s. Switch active profile");
    console.log("  d. Delete profile");
    console.log("  b. Back\n");

    const choice = (await ask(`${c.white}Choice: ${c.reset}`)).trim().toLowerCase();

    if (choice === "a") {
      console.log(`\n${c.dim}Running setup wizard for a new profile...${c.reset}\n`);
      // For now, re-run wizard; future: named profile wizard
      await runSetupWizard(true);
    } else if (choice === "s" && allProfiles.length > 1) {
      const names = allProfiles.map((p) => p.name);
      names.forEach((n, i) => {
        console.log(`  ${i + 1}. ${n}`);
      });
      const ans = (await ask(`\n${c.white}Select profile (1-${names.length}): ${c.reset}`)).trim();
      const idx = parseInt(ans, 10) - 1;
      if (idx >= 0 && idx < names.length) {
        saveGlobalConfig({ ...config, activeProfile: names[idx]! });
        console.log(`\n${c.green}✓ Switched to profile: ${names[idx]}${c.reset}\n`);
      }
    } else if (choice === "d") {
      const deletable = allProfiles.filter((p) => p.name !== config.activeProfile);
      if (deletable.length === 0) {
        console.log(`\n${c.yellow}Cannot delete the active profile.${c.reset}\n`);
      } else {
        deletable.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.name}`);
        });
        const ans = (await ask(`\n${c.white}Select profile to delete (1-${deletable.length}): ${c.reset}`)).trim();
        const idx = parseInt(ans, 10) - 1;
        if (idx >= 0 && idx < deletable.length) {
          const name = deletable[idx]!.name;
          deleteProfile(name);
          deleteCredentials(name);
          console.log(`\n${c.green}✓ Profile "${name}" deleted${c.reset}\n`);
        }
      }
    }
  } finally {
    rl.close();
  }
}

async function runResetConfig(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  try {
    console.log(`\n${c.red}${c.bold}Reset CODEXA Configuration${c.reset}\n`);
    console.log(`This will delete all profiles, credentials, and settings.`);
    const confirm = (await ask(`\n${c.white}Type "reset" to confirm: ${c.reset}`)).trim();

    if (confirm === "reset") {
      const { unlinkSync, existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      for (const file of ["config.json", "credentials.json", "profiles.json"]) {
        const fp = join(CODEXA_DIR, file);
        if (existsSync(fp)) unlinkSync(fp);
      }
      console.log(`\n${c.green}✓ Configuration reset. Run 'codexa' to set up again.${c.reset}\n`);
    } else {
      console.log(`\n${c.dim}Reset cancelled.${c.reset}\n`);
    }
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printConfigHeader(): void {
  const config = getGlobalConfig();
  const profile = config ? getProfile(config.activeProfile) : null;

  console.log(`\n${c.cyan}${c.bold}CODEXA CONFIGURATION${c.reset}\n`);
  if (profile) {
    console.log(`  Provider: ${c.yellow}${PROVIDER_DISPLAY_NAMES[profile.provider]}${c.reset}`);
    console.log(`  Model:    ${c.yellow}${profile.model}${c.reset}`);
    console.log(`  Profile:  ${c.dim}${config!.activeProfile}${c.reset}`);
  }
  console.log();
}

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function readMasked(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    let input = "";
    const handler = (chunk: Buffer) => {
      const char = chunk.toString();
      if (char === "\r" || char === "\n") {
        if (stdin.isTTY) stdin.setRawMode(false);
        stdin.removeListener("data", handler);
        process.stdout.write("\n");
        resolve(input);
      } else if (char === "\x7f" || char === "\b") {
        if (input.length > 0) { input = input.slice(0, -1); process.stdout.write("\b \b"); }
      } else if (char === "\x03") {
        if (stdin.isTTY) stdin.setRawMode(false);
        process.exit(0);
      } else {
        input += char;
        process.stdout.write("*");
      }
    };
    stdin.on("data", handler);
  });
}
