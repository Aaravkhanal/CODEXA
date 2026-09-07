import { describe, expect, test } from "bun:test";
import { CheckpointManager, PermissionEngine } from "../src/index.ts";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("Safety Permission Engine & Checkpoints", () => {
  test("PermissionEngine correctly classifies SAFE, MODERATE, and HIGH_RISK commands", () => {
    const engine = new PermissionEngine();

    const safe = engine.evaluateCommand("ls -la");
    expect(safe.riskLevel).toBe("SAFE");
    expect(safe.requiresConfirmation).toBe(false);

    const moderate = engine.evaluateCommand("npm install lodash");
    expect(moderate.riskLevel).toBe("MODERATE");

    const highRisk = engine.evaluateCommand("rm -rf /");
    expect(highRisk.riskLevel).toBe("HIGH_RISK");
    expect(highRisk.requiresConfirmation).toBe(true);
  });

  test("CheckpointManager creates and lists snapshots", () => {
    const manager = new CheckpointManager(process.cwd());
    const cp = manager.createCheckpoint("Test Checkpoint");

    expect(cp.id).toBeDefined();
    expect(cp.description).toBe("Test Checkpoint");

    const list = manager.listCheckpoints();
    expect(list.length).toBeGreaterThan(0);
  });
});
