import { describe, expect, it } from "bun:test";
import { recommendTaskModel } from "../src/lib/task-model-router";

describe("task-aware local model routing", () => {
  const available = ["claude-opus-4-6", "gemini-2.5-flash"] as const;

  it("uses the cheapest available model for a plan", () => {
    const result = recommendTaskModel(
      "Plan a migration",
      "PLAN",
      [...available],
      "claude-opus-4-6",
    );
    expect(result.model).toBe("gemini-2.5-flash");
  });

  it("keeps the selected model for implementation work", () => {
    const result = recommendTaskModel(
      "Implement a complete authentication flow with tests",
      "BUILD",
      [...available],
      "claude-opus-4-6",
    );
    expect(result.model).toBe("claude-opus-4-6");
  });

  it("falls back to an available model when the selected provider has no key", () => {
    const result = recommendTaskModel(
      "Fix the failing test",
      "BUILD",
      ["gemini-2.5-flash"],
      "claude-opus-4-6",
    );
    expect(result.model).toBe("gemini-2.5-flash");
  });
});
