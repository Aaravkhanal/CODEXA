import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointManager, ensureCodexaRuntimeIgnored, PermissionEngine } from "../src/index.ts";

describe("Safety Permission Engine & Checkpoints", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "codexa-checkpoint-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

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
    const manager = new CheckpointManager(testDir);
    const cp = manager.createCheckpoint("Test Checkpoint");

    expect(cp.id).toBeDefined();
    expect(cp.description).toBe("Test Checkpoint");

    const list = manager.listCheckpoints();
    expect(list.length).toBeGreaterThan(0);
    expect(existsSync(join(testDir, ".codexa", "checkpoints", cp.id, "metadata.json"))).toBe(true);
  });

  test("keeps runtime task history local using Git's private exclude file", () => {
    const infoDir = join(testDir, ".git", "info");
    mkdirSync(infoDir, { recursive: true });
    writeFileSync(join(infoDir, "exclude"), "# local excludes\n", "utf-8");

    ensureCodexaRuntimeIgnored(testDir);
    ensureCodexaRuntimeIgnored(testDir);

    const exclude = readFileSync(join(infoDir, "exclude"), "utf-8");
    expect(exclude).toContain(".codexa/sessions/");
    expect(exclude).toContain(".codexa/checkpoints/");
    expect(exclude.match(/\.codexa\/sessions\//g)).toHaveLength(1);
  });
});
