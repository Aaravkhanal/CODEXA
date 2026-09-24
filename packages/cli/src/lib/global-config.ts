/**
 * CODEXA Global Configuration Manager
 *
 * Manages the user's global CODEXA configuration stored in ~/.codexa/:
 *
 *   ~/.codexa/
 *   ├── config.json       ← active provider, model, preferences
 *   ├── credentials.json  ← API keys (mode 0o600, never logged)
 *   ├── profiles.json     ← named profiles
 *   ├── sessions/         ← session history
 *   ├── cache/            ← context cache
 *   └── auth.json         ← cloud auth token (existing, preserved)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ProviderName } from "@codexa/agent";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * The user configuration directory. CODEXA_CONFIG_DIR is intentionally
 * supported for CI, sandboxes, and portable installations; normal installs
 * continue to use ~/.codexa.
 */
export const CODEXA_DIR = resolve(process.env.CODEXA_CONFIG_DIR || join(homedir(), ".codexa"));

export function getCodexaDir(): string {
  return resolve(process.env.CODEXA_CONFIG_DIR || join(homedir(), ".codexa"));
}

function configFile(name: string): string {
  return join(getCodexaDir(), name);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlobalConfig {
  /** Currently active profile name */
  activeProfile: string;
  /** Version of config schema */
  version: 1;
  /** Preferences */
  preferences: {
    autoApprove: boolean;
    tokenBudget: number;
    showCostEstimates: boolean;
  };
}

export interface ProviderCredentials {
  provider: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

export type CredentialsStore = Record<string, ProviderCredentials>; // keyed by profile name

export interface Profile {
  name: string;
  provider: ProviderName;
  model: string;
  /** Optional custom API base URL (for ollama/custom providers) */
  baseUrl?: string;
}

export type ProfilesStore = Record<string, Profile>; // keyed by profile name

// ---------------------------------------------------------------------------
// Directory initialization
// ---------------------------------------------------------------------------

export function ensureCodesxaDir(): void {
  const configDir = getCodexaDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
  // Ensure sub-directories exist
  for (const sub of ["sessions", "cache", "logs"]) {
    const subDir = join(configDir, sub);
    if (!existsSync(subDir)) {
      mkdirSync(subDir, { recursive: true, mode: 0o700 });
    }
  }
}

// ---------------------------------------------------------------------------
// Config (provider/model/preferences)
// ---------------------------------------------------------------------------

function readConfig(): Partial<GlobalConfig> {
  try {
    return JSON.parse(readFileSync(configFile("config.json"), "utf-8")) as Partial<GlobalConfig>;
  } catch {
    return {};
  }
}

function writeConfig(config: GlobalConfig): void {
  ensureCodesxaDir();
  writeFileSync(configFile("config.json"), JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getGlobalConfig(): GlobalConfig | null {
  const raw = readConfig();
  if (!raw.version || !raw.activeProfile) return null;
  return {
    version: 1,
    activeProfile: raw.activeProfile ?? "default",
    preferences: {
      autoApprove: raw.preferences?.autoApprove ?? false,
      tokenBudget: raw.preferences?.tokenBudget ?? 80_000,
      showCostEstimates: raw.preferences?.showCostEstimates ?? true,
    },
  };
}

export function saveGlobalConfig(config: GlobalConfig): void {
  writeConfig(config);
}

export function isFirstRun(): boolean {
  // Already configured via new config system
  if (getGlobalConfig() !== null) return false;

  // Check legacy api-keys.json — if any provider key exists, skip wizard
  try {
    const legacyFile = configFile("api-keys.json");
    if (existsSync(legacyFile)) {
      const legacy = JSON.parse(readFileSync(legacyFile, "utf-8")) as Record<string, string>;
      if (Object.values(legacy).some(Boolean)) return false;
    }
  } catch {
    // ignore read errors
  }

  return true;
}

// ---------------------------------------------------------------------------
// Credentials (API keys — NEVER logged)
// ---------------------------------------------------------------------------

function readCredentials(): CredentialsStore {
  try {
    return JSON.parse(readFileSync(configFile("credentials.json"), "utf-8")) as CredentialsStore;
  } catch {
    return {};
  }
}

function writeCredentials(store: CredentialsStore): void {
  ensureCodesxaDir();
  writeFileSync(configFile("credentials.json"), JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function getCredentials(profileName: string): ProviderCredentials | null {
  const store = readCredentials();
  return store[profileName] ?? null;
}

export function saveCredentials(profileName: string, creds: ProviderCredentials): void {
  const store = readCredentials();
  store[profileName] = creds;
  writeCredentials(store);
}

export function deleteCredentials(profileName: string): void {
  const store = readCredentials();
  delete store[profileName];
  writeCredentials(store);
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

function readProfiles(): ProfilesStore {
  try {
    return JSON.parse(readFileSync(configFile("profiles.json"), "utf-8")) as ProfilesStore;
  } catch {
    return {};
  }
}

function writeProfiles(store: ProfilesStore): void {
  ensureCodesxaDir();
  writeFileSync(configFile("profiles.json"), JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function getProfile(name: string): Profile | null {
  const store = readProfiles();
  return store[name] ?? null;
}

export function getAllProfiles(): Profile[] {
  const store = readProfiles();
  return Object.values(store);
}

export function saveProfile(profile: Profile): void {
  const store = readProfiles();
  store[profile.name] = profile;
  writeProfiles(store);
}

export function deleteProfile(name: string): void {
  const store = readProfiles();
  delete store[name];
  writeProfiles(store);
}

// ---------------------------------------------------------------------------
// Active provider resolution
// ---------------------------------------------------------------------------

/**
 * Get the active profile + credentials for building a ProviderConfig.
 * Falls back to environment variables for API keys.
 */
export function getActiveProviderConfig(profileName?: string): {
  profile: Profile;
  apiKey: string | undefined;
  baseUrl: string | undefined;
} | null {
  const config = getGlobalConfig();
  if (!config) return null;

  const activeName = profileName ?? config.activeProfile;
  const profile = getProfile(activeName);
  if (!profile) return null;

  const creds = getCredentials(activeName);

  // Key resolution priority: stored credentials → environment variable
  let apiKey: string | undefined = creds?.apiKey;
  if (!apiKey) {
    apiKey = getEnvKeyForProvider(profile.provider);
  }

  return {
    profile,
    apiKey,
    baseUrl: creds?.baseUrl ?? profile.baseUrl,
  };
}

export function getEnvKeyForProvider(provider: ProviderName): string | undefined {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "google":
      return process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    case "groq":
      return process.env.GROQ_API_KEY;
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
    case "ollama":
    case "custom":
      return undefined;
  }
}

export function getEnvVarNameForProvider(provider: ProviderName): string | undefined {
  switch (provider) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "google":
      return process.env.GOOGLE_API_KEY ? "GOOGLE_API_KEY" : "GEMINI_API_KEY";
    case "groq":
      return "GROQ_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "ollama":
    case "custom":
      return undefined;
  }
}

/**
 * Create a usable default profile when a user already supplies an API key via
 * their shell environment. The key is never copied to disk; normal provider
 * resolution continues to read it from the environment at runtime.
 */
export function bootstrapGlobalConfigFromEnv(): boolean {
  if (getGlobalConfig() !== null) return false;

  const provider = (["anthropic", "openai", "google", "groq", "openrouter"] as ProviderName[]).find(
    (candidate) => Boolean(getEnvKeyForProvider(candidate)),
  );
  if (!provider) return false;

  const model = getDefaultModelForProvider(provider);
  saveProfile({ name: "default", provider, model });
  saveCredentials("default", { provider, model });
  saveGlobalConfig({
    version: 1,
    activeProfile: "default",
    preferences: {
      autoApprove: false,
      tokenBudget: 80_000,
      showCostEstimates: true,
    },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Migration: merge old api-keys.json into new credentials store
// ---------------------------------------------------------------------------

/**
 * One-time migration from the legacy ~/.codexa/api-keys.json format.
 * Runs automatically on first access after an upgrade.
 */
export function migrateFromLegacyApiKeys(): void {
  const legacyFile = configFile("api-keys.json");
  if (!existsSync(legacyFile)) return;

  try {
    const legacy = JSON.parse(readFileSync(legacyFile, "utf-8")) as Record<string, string>;
    const creds = readCredentials();

    // Find the first configured provider and create a "default" profile
    const providerMap: Record<string, ProviderName> = {
      anthropic: "anthropic",
      openai: "openai",
      google: "google",
      groq: "groq",
    };

    for (const [key, apiKey] of Object.entries(legacy)) {
      const provider = providerMap[key];
      if (!provider || !apiKey) continue;

      // Only migrate if no default profile exists yet
      if (!creds.default) {
        const defaultModel = getDefaultModelForProvider(provider);
        creds.default = { provider, apiKey, model: defaultModel };

        // Also create the profile entry
        const store = readProfiles();
        store.default = { name: "default", provider, model: defaultModel };
        writeProfiles(store);

        // Create global config
        if (!existsSync(configFile("config.json"))) {
          writeConfig({
            version: 1,
            activeProfile: "default",
            preferences: {
              autoApprove: false,
              tokenBudget: 80_000,
              showCostEstimates: true,
            },
          });
        }
      }
    }

    writeCredentials(creds);

    // Rename legacy file to avoid re-migration
    const { renameSync } = require("node:fs");
    renameSync(legacyFile, configFile("api-keys.json.bak"));
  } catch {
    // Migration failure is non-fatal
  }
}

export function getDefaultModelForProvider(provider: ProviderName): string {
  switch (provider) {
    case "anthropic":
      return "claude-opus-4-6";
    case "openai":
      return "gpt-4o";
    case "google":
      return "gemini-2.5-pro";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "ollama":
      return "llama3.2";
    case "openrouter":
      return "openai/gpt-4o";
    case "custom":
      return "gpt-4";
    default:
      return "gpt-4o";
  }
}

// ---------------------------------------------------------------------------
// Legacy compatibility: re-export old api-keys.ts API for backwards compat
// ---------------------------------------------------------------------------

export function getApiKey(provider: string): string | null {
  // Check new credentials store first
  const allProfiles = readProfiles();
  for (const profile of Object.values(allProfiles)) {
    if (profile.provider === provider) {
      const creds = getCredentials(profile.name);
      if (creds?.apiKey) return creds.apiKey;
    }
  }
  // Fall back to environment
  return getEnvKeyForProvider(provider as ProviderName) ?? null;
}

export function setApiKey(provider: string, key: string): void {
  const allProfiles = readProfiles();
  const profile = Object.values(allProfiles).find((p) => p.provider === provider);
  if (profile) {
    const existing = getCredentials(profile.name) ?? {
      provider: provider as ProviderName,
      model: profile.model,
    };
    saveCredentials(profile.name, { ...existing, apiKey: key });
  }
}

export function hasApiKey(provider: string): boolean {
  return Boolean(getApiKey(provider));
}

export function getAllApiKeys(): Record<string, string> {
  const result: Record<string, string> = {};
  const store = readCredentials();
  for (const [, creds] of Object.entries(store)) {
    if (creds.apiKey) result[creds.provider] = creds.apiKey;
  }
  // Also check environment
  for (const provider of ["anthropic", "openai", "google", "groq"] as ProviderName[]) {
    const envKey = getEnvKeyForProvider(provider);
    if (envKey && !result[provider]) result[provider] = envKey;
  }
  return result;
}
