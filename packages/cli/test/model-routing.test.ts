import { describe, expect, it } from "bun:test";
import { resolveCostAwareModel, calculateRoutingSavings } from "@codexa/shared";
import { resolveModelForSession } from "../src/lib/model-utils";

describe("Cost-Aware Model Routing", () => {
  it("defaults to selected model when routing is disabled", () => {
    const res = resolveCostAwareModel("plan", "claude-opus-4-6", { enabled: false });
    expect(res.activeModelId).toBe("claude-opus-4-6");
    expect(res.routed).toBe(false);
    expect(res.savingsPercent).toBe(0);
  });

  it("routes PLAN mode to cheaper model when routing is enabled", () => {
    const res = resolveCostAwareModel("plan", "claude-opus-4-6", {
      enabled: true,
      planModelId: "claude-3-5-haiku",
    });
    expect(res.activeModelId).toBe("claude-3-5-haiku");
    expect(res.originalModelId).toBe("claude-opus-4-6");
    expect(res.routed).toBe(true);
    expect(res.savingsPercent).toBeGreaterThan(50);
  });

  it("retains primary model for BUILD mode edits", () => {
    const res = resolveCostAwareModel("build", "claude-opus-4-6", { enabled: true });
    expect(res.activeModelId).toBe("claude-opus-4-6");
    expect(res.routed).toBe(false);
  });

  it("calculates cost savings delta accurately between Opus and Haiku", () => {
    const savings = calculateRoutingSavings("claude-opus-4-6", "claude-3-5-haiku", 1_000_000, 1_000_000);
    expect(savings.primaryCost).toBe(30); // $5/M input + $25/M output
    expect(savings.planCost).toBe(6);     // $1/M input + $5/M output
    expect(savings.savingsUsd).toBe(24);
    expect(savings.savingsPercent).toBe(80);
  });

  it("resolves model for session with override options", () => {
    const res = resolveModelForSession("plan", "claude-opus-4-6", process.cwd(), {
      enabled: true,
      planModelId: "gpt-4o-mini",
    });
    expect(res.activeModelId).toBe("gpt-4o-mini");
    expect(res.routed).toBe(true);
  });
});
