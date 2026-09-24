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
  isOllamaRunning,
  listOllamaModels,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_MODELS,
  type ProviderConfig,
  testProviderConnection,
} from "@codexa/agent";
import {
  ensureCodesxaDir,
  getCodexaDir,
  getEnvKeyForProvider,
  getEnvVarNameForProvider,
  saveCredentials,
  saveGlobalConfig,
  saveProfile,
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

const PROVIDER_DESCRIPTIONS: Partial<Record<ProviderName, string>> = {
  anthropic: "strong coding and reasoning",
  openai: "balanced coding and general tasks",
  google: "large context and fast models",
  groq: "very fast, low-cost open models",
  ollama: "private models running on this computer",
  openrouter: "one key for many model providers",
  custom: "self-hosted or OpenAI-compatible endpoint",
};

const PROVIDER_KEY_URLS: Partial<Record<ProviderName, string>> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/app/apikey",
  groq: "https://console.groq.com/keys",
  openrouter: "https://openrouter.ai/settings/keys",
};

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

  const askYesNo = async (question: string, defaultYes: boolean): Promise<boolean> => {
    const suffix = defaultYes ? "[Y/n]" : "[y/N]";
    const answer = (await ask(`${question} ${suffix} `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === "y" || answer === "yes";
  };

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
      console.log(`${c.white}${c.bold}Welcome to CODEXA.${c.reset}`);
      console.log(
        `${c.dim}One quick setup, then CODEXA can work inside any project you launch it from.${c.reset}\n`,
      );
      console.log(`  ${c.cyan}Project${c.reset}  ${process.cwd()}`);
      console.log(`  ${c.cyan}Setup${c.reset}    provider → API key → model → connection check\n`);
      console.log(
        `${c.dim}Credentials are stored only on this computer in ${getCodexaDir()}.${c.reset}\n`,
      );
    }

    // ── Step 1: Select provider ────────────────────────────────────────────
    console.log(`${c.cyan}${c.bold}Select your AI provider:${c.reset}\n`);
    PROVIDER_ORDER.forEach((p, i) => {
      const marker = i === 0 ? `${c.green}❯${c.reset}` : " ";
      const description = PROVIDER_DESCRIPTIONS[p];
      console.log(
        `  ${marker} ${i + 1}. ${PROVIDER_DISPLAY_NAMES[p]}${description ? ` ${c.dim}— ${description}${c.reset}` : ""}`,
      );
    });
    console.log();

    let providerIndex = -1;
    while (providerIndex < 0 || providerIndex >= PROVIDER_ORDER.length) {
      const answer = await ask(
        `${c.white}Enter number (1-${PROVIDER_ORDER.length}) [1]: ${c.reset}`,
      );
      const num = parseInt(answer.trim() || "1", 10);
      if (!Number.isNaN(num) && num >= 1 && num <= PROVIDER_ORDER.length) {
        providerIndex = num - 1;
      } else {
        console.log(
          `${c.red}  Invalid choice. Enter a number between 1 and ${PROVIDER_ORDER.length}.${c.reset}`,
        );
      }
    }

    const provider = PROVIDER_ORDER[providerIndex];
    if (!provider) {
      rl.close();
      return false;
    }
    console.log(`\n${c.green}Selected provider: ${PROVIDER_DISPLAY_NAMES[provider]}${c.reset}\n`);

    // ── Step 2: Collect credentials ────────────────────────────────────────
    let apiKey: string | undefined;
    let storedApiKey: string | undefined;
    let credentialSource = "not required";
    let baseUrl: string | undefined;

    if (provider === "ollama") {
      const ollamaBase =
        (
          await ask(
            `${c.white}Ollama base URL [press Enter for default: http://localhost:11434]: ${c.reset}`,
          )
        ).trim() || "http://localhost:11434";

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
      credentialSource = "local Ollama";
    } else if (provider === "custom") {
      baseUrl = (await ask(`\n${c.white}API Base URL: ${c.reset}`)).trim();
      if (!baseUrl) {
        console.log(`${c.red}Base URL is required for custom providers.${c.reset}`);
        rl.close();
        return false;
      }
      apiKey = await askMasked(`${c.white}API Key: ${c.reset}`);
      if (!apiKey) {
        console.log(`${c.red}API key is required for custom providers.${c.reset}`);
        rl.close();
        return false;
      }
      storedApiKey = apiKey;
      credentialSource = "local file (mode 0600)";
    } else {
      const envKey = getEnvKeyForProvider(provider);
      const envName = getEnvVarNameForProvider(provider);
      if (envKey && envName) {
        const useEnv = await askYesNo(
          `${c.green}Found ${envName} in your environment.${c.reset} Use it without saving a copy?`,
          true,
        );
        if (useEnv) {
          apiKey = envKey;
          credentialSource = `environment variable (${envName})`;
        }
      }

      if (!apiKey) {
        const keyUrl = PROVIDER_KEY_URLS[provider];
        console.log(
          `${c.dim}Create an API key${keyUrl ? `: ${keyUrl}` : " on the provider's website"}.${c.reset}`,
        );
        apiKey = await askMasked(`\n${c.white}Enter your API key: ${c.reset}`);
        storedApiKey = apiKey;
        credentialSource = "local file (mode 0600)";
      }
      if (!apiKey) {
        console.log(
          `${c.red}API key is required for ${PROVIDER_DISPLAY_NAMES[provider]}.${c.reset}`,
        );
        rl.close();
        return false;
      }
    }

    // ── Step 3: Select model ───────────────────────────────────────────────
    let model = "";
    let availableModels = PROVIDER_MODELS[provider];

    if (provider === "ollama") {
      console.log(`\n${c.dim}Fetching available local models...${c.reset}`);
      const ollamaModels = await listOllamaModels(baseUrl);
      if (ollamaModels.length > 0) {
        availableModels = ollamaModels.map((m: { name: string }) => m.name);
        console.log(`\n${c.cyan}${c.bold}Available local models:${c.reset}\n`);
        availableModels.slice(0, 15).forEach((m: string, i: number) => {
          const marker = i === 0 ? `${c.green}❯${c.reset}` : " ";
          console.log(`  ${marker} ${i + 1}. ${m}`);
        });
        console.log();

        let modelIndex = -1;
        while (modelIndex < 0 || modelIndex >= availableModels.length) {
          const answer = await ask(
            `${c.white}Select model (1-${availableModels.length}) or type model name [1]: ${c.reset}`,
          );
          const normalizedAnswer = answer.trim() || "1";
          const num = parseInt(normalizedAnswer, 10);
          if (!Number.isNaN(num) && num >= 1 && num <= availableModels.length) {
            modelIndex = num - 1;
          } else if (normalizedAnswer.length > 0) {
            model = normalizedAnswer;
            modelIndex = 0; // exit loop
          } else {
            console.log(`${c.red}  Please enter a number or model name.${c.reset}`);
          }
        }
        model ||= availableModels[modelIndex] ?? "";
      } else {
        model = (
          await ask(`\n${c.white}Enter model name (e.g. llama3.2, qwen2.5-coder): ${c.reset}`)
        ).trim();
      }
    } else if (availableModels.length > 0) {
      console.log(`\n${c.cyan}${c.bold}Select model:${c.reset}\n`);
      availableModels.forEach((m: string, i: number) => {
        const marker = i === 0 ? `${c.green}❯${c.reset}` : " ";
        console.log(`  ${marker} ${i + 1}. ${m}`);
      });
      console.log(`      ${availableModels.length + 1}. Other (enter manually)`);
      console.log();

      let modelChoice = -1;
      while (modelChoice < 0) {
        const answer = await ask(
          `${c.white}Select model (1-${availableModels.length + 1}) [1]: ${c.reset}`,
        );
        const num = parseInt(answer.trim() || "1", 10);
        if (!Number.isNaN(num) && num >= 1 && num <= availableModels.length) {
          model = availableModels[num - 1] ?? "";
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

    if (!model) {
      console.log(`${c.red}Model is required.${c.reset}`);
      rl.close();
      return false;
    }

    // ── Step 4: Test connection ────────────────────────────────────────────
    console.log(`\n${c.dim}Testing connection to ${PROVIDER_DISPLAY_NAMES[provider]}...${c.reset}`);

    let providerConfig: ProviderConfig;
    if (provider === "ollama") {
      providerConfig = { provider: "ollama", baseUrl, model };
    } else if (provider === "custom") {
      if (!baseUrl || !apiKey) {
        rl.close();
        return false;
      }
      providerConfig = { provider: "custom", baseUrl, apiKey, model };
    } else {
      if (!apiKey) {
        rl.close();
        return false;
      }
      providerConfig = { provider, apiKey, model } as ProviderConfig;
    }

    const testResult = await testProviderConnection(providerConfig);

    let connectionVerified = testResult.success;
    if (!testResult.success) {
      console.log(`\n${c.red}✗ Connection failed${c.reset}\n`);
      console.log(`  ${c.red}${testResult.error}${c.reset}\n`);
      const saveAnyway = await askYesNo(
        `${c.yellow}Save this configuration anyway? You can retry later with 'codexa doctor'.${c.reset}`,
        false,
      );
      if (!saveAnyway) {
        console.log(`\nRun ${c.cyan}codexa setup${c.reset} when you are ready to try again.\n`);
        rl.close();
        return false;
      }
      connectionVerified = false;
    } else {
      console.log(
        `${c.green}✓ Connection successful${testResult.latencyMs !== undefined ? ` (${testResult.latencyMs}ms)` : ""}${c.reset}`,
      );
    }

    // ── Step 5: Save configuration ─────────────────────────────────────────
    ensureCodesxaDir();

    saveProfile({
      name: "default",
      provider,
      model,
      baseUrl,
    });

    saveCredentials("default", {
      provider,
      apiKey: storedApiKey,
      baseUrl,
      model,
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
    console.log(
      `  ${c.green}✓ Provider configured:${c.reset}  ${PROVIDER_DISPLAY_NAMES[provider]}`,
    );
    console.log(`  ${c.green}✓ Credentials:${c.reset}        ${credentialSource}`);
    console.log(`  ${c.green}✓ Model selected:${c.reset}     ${model}`);
    console.log(
      `  ${connectionVerified ? c.green : c.yellow}${connectionVerified ? "✓" : "!"} Connection:${c.reset}         ${connectionVerified ? "verified" : "saved; verification still needed"}`,
    );
    console.log(`  ${c.green}✓ Project:${c.reset}            ${process.cwd()}\n`);

    console.log(`${c.cyan}${c.bold}Try your first task:${c.reset}`);
    console.log(
      `  ${c.white}codexa "explain this project and suggest the best next improvement"${c.reset}\n`,
    );
    console.log(`${c.cyan}${c.bold}Useful commands:${c.reset}`);
    console.log(`  ${c.white}codexa${c.reset}          Open the interactive coding agent`);
    console.log(
      `  ${c.white}codexa doctor${c.reset}   Check runtime, credentials, and project setup`,
    );
    console.log(
      `  ${c.white}codexa config${c.reset}   Change provider, model, API key, or profile`,
    );
    console.log(`  ${c.white}/model${c.reset}          Switch models without leaving a chat`);
    console.log(`  ${c.white}/apikey${c.reset}         Add or replace provider credentials\n`);

    await ask("Press Enter to continue...");
    rl.close();
    return true;
  } catch (err: unknown) {
    rl.close();
    if ((err as NodeJS.ErrnoException)?.code === "ERR_USE_AFTER_CLOSE") return false;
    throw err;
  }
}
