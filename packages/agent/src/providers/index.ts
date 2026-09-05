/**
 * CODEXA Agent Provider Abstraction
 *
 * Unified factory for creating AI LanguageModel instances across all
 * supported providers. The agent core only sees `LanguageModel` — it
 * never contains provider-specific logic.
 *
 * Supported providers:
 *   anthropic   — Anthropic Claude models
 *   openai      — OpenAI GPT models
 *   google      — Google Gemini models
 *   groq        — Groq-hosted open models
 *   ollama      — Local Ollama models (no API key required)
 *   openrouter  — OpenRouter (hundreds of models via one key)
 *   custom      — Any OpenAI-compatible API
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

// ---------------------------------------------------------------------------
// Provider config types
// ---------------------------------------------------------------------------

export type ProviderName =
  | "anthropic"
  | "openai"
  | "google"
  | "groq"
  | "ollama"
  | "openrouter"
  | "custom";

export interface AnthropicProviderConfig {
  provider: "anthropic";
  apiKey: string;
  model: string;
}

export interface OpenAIProviderConfig {
  provider: "openai";
  apiKey: string;
  model: string;
}

export interface GoogleProviderConfig {
  provider: "google";
  apiKey: string;
  model: string;
}

export interface GroqProviderConfig {
  provider: "groq";
  apiKey: string;
  model: string;
}

export interface OllamaProviderConfig {
  provider: "ollama";
  /** Base URL of the Ollama server. Defaults to http://localhost:11434. */
  baseUrl?: string;
  model: string;
  apiKey?: never; // Ollama does not require an API key
}

export interface OpenRouterProviderConfig {
  provider: "openrouter";
  apiKey: string;
  model: string;
}

export interface CustomProviderConfig {
  provider: "custom";
  /** OpenAI-compatible API base URL */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Optional display name shown in the TUI */
  name?: string;
}

export type ProviderConfig =
  | AnthropicProviderConfig
  | OpenAIProviderConfig
  | GoogleProviderConfig
  | GroqProviderConfig
  | OllamaProviderConfig
  | OpenRouterProviderConfig
  | CustomProviderConfig;

// ---------------------------------------------------------------------------
// Curated model lists per provider (shown in the setup wizard)
// ---------------------------------------------------------------------------

export const PROVIDER_MODELS: Record<ProviderName, string[]> = {
  anthropic: [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
  ],
  openai: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o", "gpt-4o-mini"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],
  ollama: [], // populated dynamically at runtime
  openrouter: [], // populated dynamically (or user-entered)
  custom: [], // user-specified
};

export const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google (Gemini)",
  groq: "Groq",
  ollama: "Ollama (local, no API key)",
  openrouter: "OpenRouter",
  custom: "Custom / OpenAI-compatible API",
};

export const PROVIDERS_REQUIRING_KEY: ProviderName[] = [
  "anthropic",
  "openai",
  "google",
  "groq",
  "openrouter",
  "custom",
];

export const PROVIDERS_WITHOUT_KEY: ProviderName[] = ["ollama"];

// ---------------------------------------------------------------------------
// Model factory
// ---------------------------------------------------------------------------

/**
 * Create a LanguageModel instance from a provider configuration.
 *
 * The returned model can be passed directly to `generateText`, `streamText`,
 * etc. from the `ai` package.
 */
export function createLanguageModel(config: ProviderConfig): LanguageModel {
  switch (config.provider) {
    case "anthropic": {
      const client = createAnthropic({ apiKey: config.apiKey });
      // Map friendly IDs to SDK IDs
      const sdkId = mapAnthropicModelId(config.model);
      return client(sdkId) as any;
    }

    case "openai": {
      const client = createOpenAI({ apiKey: config.apiKey });
      return client(config.model) as any;
    }

    case "google": {
      const client = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return client(config.model) as any;
    }

    case "groq": {
      const client = createGroq({ apiKey: config.apiKey });
      return client(config.model) as any;
    }

    case "ollama": {
      // Ollama exposes an OpenAI-compatible API at /v1
      const baseURL = (config.baseUrl ?? "http://localhost:11434").replace(/\/$/, "") + "/v1";
      const client = createOpenAI({
        baseURL,
        apiKey: "ollama", // Ollama ignores this but the SDK requires it
      });
      return client(config.model) as any;
    }

    case "openrouter": {
      const client = createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: config.apiKey,
        headers: {
          "HTTP-Referer": "https://github.com/Aaravkhanal/CODEXA",
          "X-Title": "CODEXA AI Coding Agent",
        },
      });
      return client(config.model) as any;
    }

    case "custom": {
      const client = createOpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      });
      return client(config.model) as any;
    }

    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown provider: ${(_exhaustive as ProviderConfig).provider}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Ollama helpers
// ---------------------------------------------------------------------------

export interface OllamaModel {
  name: string;
  size: number;
}

/**
 * Fetch available models from a local Ollama server.
 * Returns an empty array if Ollama is not running or not installed.
 */
export async function listOllamaModels(baseUrl = "http://localhost:11434"): Promise<OllamaModel[]> {
  try {
    const url = baseUrl.replace(/\/$/, "") + "/api/tags";
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string; size: number }[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

/**
 * Check whether Ollama is running at the given base URL.
 */
export async function isOllamaRunning(baseUrl = "http://localhost:11434"): Promise<boolean> {
  const models = await listOllamaModels(baseUrl);
  return models.length > 0 || (await checkOllamaHealth(baseUrl));
}

async function checkOllamaHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl.replace(/\/$/, "") + "/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export interface ProviderTestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
}

/**
 * Test a provider configuration by making a minimal API call.
 * Returns the test result with latency on success or error message on failure.
 */
export async function testProviderConnection(config: ProviderConfig): Promise<ProviderTestResult> {
  const start = Date.now();

  try {
    if (config.provider === "ollama") {
      const running = await isOllamaRunning(config.baseUrl);
      if (!running) {
        return {
          success: false,
          error: "Ollama is not running. Start it with: ollama serve",
        };
      }
      return { success: true, latencyMs: Date.now() - start };
    }

    // For all other providers: make a minimal generateText call
    const { generateText } = await import("ai");
    const model = createLanguageModel(config);
    await (generateText as any)({
      model,
      prompt: "Reply with exactly: ok",
    });

    return { success: true, latencyMs: Date.now() - start };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Sanitize: never leak API keys in error messages
    const sanitized = message.replace(/sk-[A-Za-z0-9_-]{10,}/g, "sk-***");
    return { success: false, error: sanitized };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapAnthropicModelId(id: string): string {
  if (id === "claude-3-5-sonnet") return "claude-3-5-sonnet-latest";
  if (id === "claude-3-5-haiku") return "claude-3-5-haiku-latest";
  return id;
}
