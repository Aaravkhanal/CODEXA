/**
 * CODEXA First-Run Setup Wizard
 *
 * A pure-terminal interactive setup wizard (no OpenTUI dependency) that:
 *   1. Welcomes the user
 *   2. Prompts them to select an AI provider
 *   3. Collects credentials (API key / base URL)
 *   4. Lets them select or enter a model
 *   5. Tests the connection with a real API call
 *   6. Saves configuration to ~/.codexa/
 *
 * Runs before the TUI launches on first run.
 * All API keys are masked in terminal output and never logged.
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
  saveGlobalConfig,
  saveCredentials,
  saveProfile,
  ensureCodesxaDir,
} from "./global-config.ts";

// ---------------------------------------------------------------------------
// ANSI colors (avoids a dependency)
// ---------------------------------------------------------------------------

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
};

const BANNER = `
${c.cyan}${c.bold}╭────────────────────────────────────────────╮
│                   CODEXA                   │
│         AI Software Engineering Agent      │
╰────────────────────────────────────────────╯${c.reset}
`;

const PROVIDER_ORDER: ProviderName[] = [
  "anthropic",
  "openai",
  "google",
  "groq",
  "ollama",
  "openrouter",
  "custom",
];

// ---------------------------------------------------------------------------
// Wizard entry point
// ---------------------------------------------------------------------------

/**
 * Run the interactive first-run setup wizard.
 * Returns true if setup completed successfully, false if aborted.
 */
export async function runSetupWizard(isReconfigure = false): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  const askMasked = (question: string): Promise<string> =>
    new Promise((resolve) => {
      const stdin = process.stdin;
      process.stdout.write(question);

      // Disable echo for key input
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
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (char === "\x03") {
          // Ctrl+C
          if (stdin.isTTY) stdin.setRawMode(false);
          process.exit(0);
        } else {
          input += char;
          process.stdout.write("*");
        }
      };
      stdin.on("data", handler);
    });

  try {
    console.clear();
    console.log(BANNER);

    if (isReconfigure) {
      console.log(`${c.yellow}Reconfiguring CODEXA AI provider...${c.reset}\n`);
    } else {
      console.log(`${c.white}Welcome to CODEXA!\n`);
      console.log(`Before we begin, let's configure your AI provider.${c.reset}\n`);
    }

    // ── Step 1: Select provider ────────────────────────────────────────────
    console.log(`${c.cyan}${c.bold}Select your AI provider:${c.reset}\n`);
    PROVIDER_ORDER.forEach((p, i) => {
      const marker = i === 0 ? `${c.green}❯${c.reset}` : " ";
      console.log(`  ${marker} ${i + 1}. ${PROVIDER_DISPLAY_NAMES[p]}`);
    });
    console.log();

    let providerIndex = -1;
    while (providerIndex < 0 || providerIndex >= PROVIDER_ORDER.length) {
      const answer = await ask(
        `${c.white}Enter number (1-${PROVIDER_ORDER.length}): ${c.reset}`,
      );
      const num = parseInt(answer.trim(), 10);
      if (!isNaN(num) && num >= 1 && num <= PROVIDER_ORDER.length) {
        providerIndex = num - 1;
      } else {
        console.log(`${c.red}  Invalid choice. Enter a number between 1 and ${PROVIDER_ORDER.length}.${c.reset}`);
      }
    }

    const provider = PROVIDER_ORDER[providerIndex]!;
    console.log(`\n${c.green}Selected provider: ${PROVIDER_DISPLAY_NAMES[provider]}${c.reset}\n`);

    // ── Step 2: Collect credentials ────────────────────────────────────────
    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    if (provider === "ollama") {
      const ollamaBase = (await ask(
        `${c.white}Ollama base URL [press Enter for default: http://localhost:11434]: ${c.reset}`,
      )).trim() || "http://localhost:11434";

      baseUrl = ollamaBase;

      console.log(`\n${c.dim}Checking local Ollama installation at ${ollamaBase}...${c.reset}`);
      const running = await isOllamaRunning(ollamaBase);
      if (!running) {
        console.log(`\n${c.red}✗ Ollama is not running at ${ollamaBase}.${c.reset}`);
        console.log(`\n  Start Ollama with: ${c.cyan}ollama serve${c.reset}`);
        console.log(`  Then re-run: ${c.cyan}codexa config${c.reset}\n`);
        rl.close();
        return false;
      }
      console.log(`${c.green}✓ Ollama detected${c.reset}`);
    } else if (provider === "custom") {
      baseUrl = (await ask(`\n${c.white}API Base URL: ${c.reset}`)).trim();
      if (!baseUrl) {
        console.log(`${c.red}Base URL is required for custom providers.${c.reset}`);
        rl.close();
        return false;
      }
      apiKey = await askMasked(`${c.white}API Key: ${c.reset}`);
    } else {
      // Cloud providers: require API key
      console.log(`${c.dim}You can get your API key from the provider's website.${c.reset}`);
      apiKey = await askMasked(`\n${c.white}Enter your API key: ${c.reset}`);
      if (!apiKey) {
        console.log(`${c.red}API key is required for ${PROVIDER_DISPLAY_NAMES[provider]}.${c.reset}`);
        rl.close();
        return false;
      }
    }

    // ── Step 3: Select model ───────────────────────────────────────────────
    let model: string;
    let availableModels = PROVIDER_MODELS[provider];

    if (provider === "ollama") {
      console.log(`\n${c.dim}Fetching available local models...${c.reset}`);
      const ollamaModels = await listOllamaModels(baseUrl);
      if (ollamaModels.length > 0) {
        availableModels = ollamaModels.map((m) => m.name);
        console.log(`\n${c.cyan}${c.bold}Available local models:${c.reset}\n`);
        availableModels.slice(0, 15).forEach((m, i) => {
          const marker = i === 0 ? `${c.green}❯${c.reset}` : " ";
          console.log(`  ${marker} ${i + 1}. ${m}`);
        });
        console.log();

        let modelIndex = -1;
        while (modelIndex < 0 || modelIndex >= availableModels.length) {
          const answer = await ask(
            `${c.white}Select model (1-${availableModels.length}) or type model name: ${c.reset}`,
          );
          const num = parseInt(answer.trim(), 10);
          if (!isNaN(num) && num >= 1 && num <= availableModels.length) {
            modelIndex = num - 1;
          } else if (answer.trim().length > 0) {
            model = answer.trim();
            modelIndex = 0; // exit loop
          } else {
            console.log(`${c.red}  Please enter a number or model name.${c.reset}`);
          }
        }
        model = model! ?? availableModels[modelIndex]!;
      } else {
        model = (await ask(`\n${c.white}Enter model name (e.g. llama3.2, qwen2.5-coder): ${c.reset}`)).trim();
      }
    } else if (availableModels.length > 0) {
      console.log(`\n${c.cyan}${c.bold}Select model:${c.reset}\n`);
      availableModels.forEach((m, i) => {
        const marker = i === 0 ? `${c.green}❯${c.reset}` : " ";
        console.log(`  ${marker} ${i + 1}. ${m}`);
      });
      console.log(`      ${availableModels.length + 1}. Other (enter manually)`);
      console.log();

      let modelChoice = -1;
      while (modelChoice < 0) {
        const answer = await ask(
          `${c.white}Select model (1-${availableModels.length + 1}): ${c.reset}`,
        );
        const num = parseInt(answer.trim(), 10);
        if (!isNaN(num) && num >= 1 && num <= availableModels.length) {
          model = availableModels[num - 1]!;
          modelChoice = num;
        } else if (num === availableModels.length + 1) {
          model = (await ask(`${c.white}Enter model ID: ${c.reset}`)).trim();
          modelChoice = num;
        } else {
          console.log(`${c.red}  Invalid choice.${c.reset}`);
        }
      }
    } else {
      model = (await ask(`\n${c.white}Enter model ID: ${c.reset}`)).trim();
    }

    if (!model!) {
      console.log(`${c.red}Model is required.${c.reset}`);
      rl.close();
      return false;
    }

    // ── Step 4: Test connection ────────────────────────────────────────────
    console.log(`\n${c.dim}Testing connection to ${PROVIDER_DISPLAY_NAMES[provider]}...${c.reset}`);

    const providerConfig: ProviderConfig =
      provider === "ollama"
        ? { provider: "ollama", baseUrl, model }
        : provider === "custom"
          ? { provider: "custom", baseUrl: baseUrl!, apiKey: apiKey!, model }
          : { provider, apiKey: apiKey!, model } as ProviderConfig;

    const testResult = await testProviderConnection(providerConfig);

    if (!testResult.success) {
      console.log(`\n${c.red}✗ Connection failed${c.reset}\n`);
      console.log(`  ${c.red}${testResult.error}${c.reset}\n`);
      console.log(
        `${c.yellow}Please check your credentials and try again.${c.reset}`,
      );
      console.log(`Run ${c.cyan}codexa config${c.reset} to reconfigure.\n`);
      rl.close();
      return false;
    }

    console.log(`${c.green}✓ Connection successful${testResult.latencyMs !== undefined ? ` (${testResult.latencyMs}ms)` : ""}${c.reset}`);

    // ── Step 5: Save configuration ─────────────────────────────────────────
    ensureCodesxaDir();

    saveProfile({
      name: "default",
      provider,
      model: model!,
      baseUrl,
    });

    saveCredentials("default", {
      provider,
      apiKey,
      baseUrl,
      model: model!,
    });

    saveGlobalConfig({
      version: 1,
      activeProfile: "default",
      preferences: {
        autoApprove: false,
        tokenBudget: 80_000,
        showCostEstimates: true,
      },
    });

    // ── Done ───────────────────────────────────────────────────────────────
    console.log(`\n${c.green}${c.bold}╭──────────────────────────────────────────╮`);
    console.log(`│          CODEXA is ready! ✓              │`);
    console.log(`╰──────────────────────────────────────────╯${c.reset}\n`);
    console.log(`  ${c.green}✓ Provider configured:${c.reset}  ${PROVIDER_DISPLAY_NAMES[provider]}`);
    console.log(`  ${c.green}✓ API credentials:${c.reset}    ${apiKey ? "verified" : "not required"}`);
    console.log(`  ${c.green}✓ Model selected:${c.reset}     ${model}`);
    console.log(`  ${c.green}✓ CODEXA is ready${c.reset}\n`);
    console.log(`${c.dim}You can change these settings later with: ${c.cyan}codexa config${c.reset}\n`);

    await ask("Press Enter to continue...");
    rl.close();
    return true;
  } catch (err: unknown) {
    rl.close();
    if ((err as NodeJS.ErrnoException)?.code === "ERR_USE_AFTER_CLOSE") return false;
    throw err;
  }
}
