import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  saveGlobalConfig,
  getGlobalConfig,
  saveProfile,
  getProfile,
  saveCredentials,
  getCredentials,
  getAllProfiles,
  deleteProfile,
} from "../src/lib/global-config.ts";

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
});
