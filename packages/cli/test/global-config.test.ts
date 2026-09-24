import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CODEXA_CONFIG_DIR = mkdtempSync(join(tmpdir(), "codexa-config-test-"));

const {
  saveGlobalConfig,
  getGlobalConfig,
  saveProfile,
  getProfile,
  saveCredentials,
  getCredentials,
  getAllProfiles,
  deleteProfile,
  bootstrapGlobalConfigFromEnv,
  getActiveProviderConfig,
  isFirstRun,
} = await import("../src/lib/global-config.ts");

describe("Global Config & Profile Management", () => {
  it("saves and retrieves global config", () => {
    saveGlobalConfig({
      version: 1,
      activeProfile: "test-profile",
      preferences: {
        autoApprove: true,
        tokenBudget: 50000,
        showCostEstimates: false,
      },
    });

    const cfg = getGlobalConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.activeProfile).toBe("test-profile");
    expect(cfg?.preferences.autoApprove).toBe(true);
    expect(cfg?.preferences.tokenBudget).toBe(50000);
  });

  it("manages profiles and credentials", () => {
    saveProfile({
      name: "fast",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });

    saveCredentials("fast", {
      provider: "groq",
      apiKey: "gsk_test12345",
      model: "llama-3.3-70b-versatile",
    });

    const profile = getProfile("fast");
    expect(profile?.provider).toBe("groq");
    expect(profile?.model).toBe("llama-3.3-70b-versatile");

    const creds = getCredentials("fast");
    expect(creds?.apiKey).toBe("gsk_test12345");

    const all = getAllProfiles();
    expect(all.some((p) => p.name === "fast")).toBe(true);

    deleteProfile("fast");
    expect(getProfile("fast")).toBeNull();
  });

  it("bootstraps a usable profile from an environment API key without storing it", () => {
    const previousConfigDir = process.env.CODEXA_CONFIG_DIR;
    const providerVariables = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_API_KEY",
      "GEMINI_API_KEY",
      "GROQ_API_KEY",
      "OPENROUTER_API_KEY",
    ] as const;
    const previousValues = Object.fromEntries(
      providerVariables.map((name) => [name, process.env[name]]),
    );

    try {
      process.env.CODEXA_CONFIG_DIR = mkdtempSync(join(tmpdir(), "codexa-env-bootstrap-test-"));
      for (const name of providerVariables) delete process.env[name];
      process.env.OPENAI_API_KEY = "sk-env-only-test";

      expect(isFirstRun()).toBe(true);
      expect(bootstrapGlobalConfigFromEnv()).toBe(true);
      expect(bootstrapGlobalConfigFromEnv()).toBe(false);

      const active = getActiveProviderConfig();
      expect(active?.profile.provider).toBe("openai");
      expect(active?.profile.model).toBe("gpt-4o");
      expect(active?.apiKey).toBe("sk-env-only-test");
      expect(getCredentials("default")?.apiKey).toBeUndefined();
    } finally {
      process.env.CODEXA_CONFIG_DIR = previousConfigDir;
      for (const name of providerVariables) {
        const previous = previousValues[name];
        if (previous === undefined) delete process.env[name];
        else process.env[name] = previous;
      }
    }
  });
});
