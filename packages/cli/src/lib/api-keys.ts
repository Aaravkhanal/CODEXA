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

type StoredKeys = Record<string, string>; // provider -> api key

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadKeys(): StoredKeys {
  try {
    const raw = readFileSync(KEYS_FILE, "utf-8");
    return JSON.parse(raw) as StoredKeys;
  } catch {
    return {};
  }
}

function saveKeys(keys: StoredKeys): void {
  ensureConfigDir();
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
}

export function getApiKey(provider: string): string | null {
  const keys = loadKeys();
  return keys[provider] ?? null;
}

export function setApiKey(provider: string, key: string): void {
  const keys = loadKeys();
  keys[provider] = key;
  saveKeys(keys);
}

export function removeApiKey(provider: string): void {
  const keys = loadKeys();
  delete keys[provider];
  saveKeys(keys);
}

export function getAllApiKeys(): StoredKeys {
  return loadKeys();
}

export function hasApiKey(provider: string): boolean {
  const keys = loadKeys();
  return Boolean(keys[provider]);
}
