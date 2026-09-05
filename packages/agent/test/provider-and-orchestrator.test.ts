import { describe, expect, it } from "bun:test";
import {
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_MODELS,
  PROVIDERS_REQUIRING_KEY,
  isOllamaRunning,
  listOllamaModels,
  ContextEngine,
} from "../src/index.ts";
import { join } from "node:path";

describe("Agent Core & Providers", () => {
  it("exposes all supported providers with display names", () => {
    expect(PROVIDER_DISPLAY_NAMES.anthropic).toBe("Anthropic");
    expect(PROVIDER_DISPLAY_NAMES.openai).toBe("OpenAI");
    expect(PROVIDER_DISPLAY_NAMES.google).toBe("Google (Gemini)");
    expect(PROVIDER_DISPLAY_NAMES.groq).toBe("Groq");
    expect(PROVIDER_DISPLAY_NAMES.ollama).toContain("Ollama");
    expect(PROVIDER_DISPLAY_NAMES.openrouter).toBe("OpenRouter");
    expect(PROVIDER_DISPLAY_NAMES.custom).toContain("Custom");
  });

  it("identifies providers requiring key", () => {
    expect(PROVIDERS_REQUIRING_KEY).toContain("anthropic");
    expect(PROVIDERS_REQUIRING_KEY).toContain("openai");
    expect(PROVIDERS_REQUIRING_KEY).not.toContain("ollama");
  });

  it("lists default models for cloud providers", () => {
    expect(PROVIDER_MODELS.anthropic).toContain("claude-opus-4-6");
    expect(PROVIDER_MODELS.openai).toContain("gpt-4o");
    expect(PROVIDER_MODELS.google).toContain("gemini-2.5-pro");
  });

  it("gracefully handles Ollama checks when Ollama is offline", async () => {
    const running = await isOllamaRunning("http://127.0.0.1:59999");
    expect(running).toBe(false);

    const models = await listOllamaModels("http://127.0.0.1:59999");
    expect(models).toEqual([]);
  });

  it("ContextEngine builds context prioritizing relevant files within token budget", async () => {
    const cwd = join(import.meta.dir, "../../..");
    const engine = new ContextEngine(cwd, 10000);
    const context = await engine.buildContext("Fix CLI tests");

    expect(context.files.length).toBeGreaterThan(0);
    expect(context.totalTokensUsed).toBeLessThanOrEqual(10000);
    expect(context.files.some((f) => f.path.includes("package.json") || f.path.includes("README"))).toBe(true);
  });
});
