import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".codexa");
const KEYS_FILE = join(CONFIG_DIR, "api-keys.json");
const CREDS_FILE = join(CONFIG_DIR, "credentials.json");

type StoredKeys = Record<string, string>; // provider -> api key

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadLegacyKeys(): StoredKeys {
  try {
    if (existsSync(KEYS_FILE)) {
      const raw = readFileSync(KEYS_FILE, "utf-8");
      return JSON.parse(raw) as StoredKeys;
    }
  } catch {}
  return {};
}

function loadCredentialsKeys(): StoredKeys {
  try {
    if (existsSync(CREDS_FILE)) {
      const raw = readFileSync(CREDS_FILE, "utf-8");
      const creds = JSON.parse(raw) as Record<string, { provider?: string; apiKey?: string }>;
      const result: StoredKeys = {};
      for (const entry of Object.values(creds)) {
        if (entry.provider && entry.apiKey) {
          result[entry.provider] = entry.apiKey;
        }
      }
      return result;
    }
  } catch {}
  return {};
}

function getEnvKey(provider: string): string | null {
  const p = provider.toLowerCase();
  if (p === "anthropic") return process.env.ANTHROPIC_API_KEY || null;
  if (p === "openai") return process.env.OPENAI_API_KEY || null;
  if (p === "google" || p === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  if (p === "groq") return process.env.GROQ_API_KEY || null;
  if (p === "openrouter") return process.env.OPENROUTER_API_KEY || null;
  return null;
}

function saveKeys(keys: StoredKeys): void {
  ensureConfigDir();
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
}

export function getApiKey(provider: string): string | null {
  // 1. Check direct environment variable
  const env = getEnvKey(provider);
  if (env) return env;

  // 2. Check ~/.codexa/api-keys.json
  const legacy = loadLegacyKeys();
  if (legacy[provider]) return legacy[provider];

  // 3. Check ~/.codexa/credentials.json
  const creds = loadCredentialsKeys();
  if (creds[provider]) return creds[provider];

  return null;
}

export function setApiKey(provider: string, key: string): void {
  const keys = loadLegacyKeys();
  keys[provider] = key;
  saveKeys(keys);

  // Also sync to credentials.json if present
  try {
    const credsRaw = existsSync(CREDS_FILE) ? readFileSync(CREDS_FILE, "utf-8") : "{}";
    const creds = JSON.parse(credsRaw) as Record<string, any>;
    creds[provider] = {
      ...(creds[provider] || {}),
      provider,
      apiKey: key,
    };
    writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
  } catch {}
}

export function removeApiKey(provider: string): void {
  const keys = loadLegacyKeys();
  delete keys[provider];
  saveKeys(keys);

  try {
    if (existsSync(CREDS_FILE)) {
      const credsRaw = readFileSync(CREDS_FILE, "utf-8");
      const creds = JSON.parse(credsRaw) as Record<string, any>;
      delete creds[provider];
      writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
    }
  } catch {}
}

export function getAllApiKeys(): StoredKeys {
  const merged: StoredKeys = {};

  // 1. Credentials store
  Object.assign(merged, loadCredentialsKeys());

  // 2. Legacy keys store
  Object.assign(merged, loadLegacyKeys());

  // 3. Environment variables
  for (const provider of ["anthropic", "openai", "google", "groq", "openrouter"]) {
    const env = getEnvKey(provider);
    if (env && !merged[provider]) {
      merged[provider] = env;
    }
  }

  return merged;
}

export function hasApiKey(provider: string): boolean {
  return Boolean(getApiKey(provider));
}
