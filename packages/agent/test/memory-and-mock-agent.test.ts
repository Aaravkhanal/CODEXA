import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectMemoryManager } from "../src/memory/project-memory.ts";
import { AgentOrchestrator } from "../src/orchestrator/index.ts";
import { createMockModel, testProviderConnection } from "../src/providers/index.ts";

describe("Project Memory & Mock Agent Loop", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "codexa-mem-test-"));
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "student-calc-app",
        version: "1.0.0",
        scripts: { test: "echo 'all tests pass'" },
      }),
      "utf-8",
    );
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("initializes project memory and records incremental summaries", () => {
    const memoryManager = new ProjectMemoryManager(testDir);
    const initial = memoryManager.getOrInitMemory({
      projectName: "student-calc-app",
      frameworks: ["React"],
      languages: ["TypeScript"],
      packageManager: "bun",
    });

    expect(initial).toContain("Project Memory: student-calc-app");
    expect(initial).toContain("TypeScript");
    expect(memoryManager.hasMemory()).toBe(true);

    memoryManager.recordSessionSummary({
      sessionId: "test-session-123",
      timestamp: Date.now(),
      task: "Add addition feature",
      summary: "Implemented add function and tests",
      filesModified: ["src/calc.ts"],
      testsRun: true,
      testsPassed: true,
    });

    const resumeInfo = memoryManager.getResumeInfo();
    expect(resumeInfo.hasMemory).toBe(true);
    expect(resumeInfo.lastSummary).toBe("Implemented add function and tests");
    expect(resumeInfo.filesModified).toEqual(["src/calc.ts"]);
    expect(resumeInfo.testsPassed).toBe(true);

    // Export test
    const exportResult = memoryManager.exportMemory(join(testDir, "export.md"));
    expect(exportResult.success).toBe(true);
    expect(existsSync(exportResult.path)).toBe(true);
    const exportContent = readFileSync(exportResult.path, "utf-8");
    expect(exportContent).toContain("Add addition feature");
  });

  it("imports external markdown notes and merges into memory", () => {
    const memoryManager = new ProjectMemoryManager(testDir);
    memoryManager.getOrInitMemory();

    const notesPath = join(testDir, "notes.md");
    writeFileSync(notesPath, "# Extra Notes\nJWT token expires in 15 minutes.", "utf-8");

    const res = memoryManager.importMemory(notesPath);
    expect(res.success).toBe(true);

    const updated = memoryManager.getOrInitMemory();
    expect(updated).toContain("JWT token expires in 15 minutes");
  });

  it("tests mock provider connection instantly with zero network calls", async () => {
    const res = await testProviderConnection({
      provider: "mock",
      model: "mock-coding-model",
    });

    expect(res.success).toBe(true);
    expect(res.latencyMs).toBeDefined();
  });

  it("runs full AgentOrchestrator pipeline using mock provider and updates memory", async () => {
    const orchestrator = new AgentOrchestrator({
      cwd: testDir,
      providerConfig: {
        provider: "mock",
        model: "mock-coding-model",
      },
      planProviderConfig: {
        provider: "mock",
        model: "mock-fast-model",
      },
      autoApprove: true,
    });

    const progressEvents: string[] = [];
    const result = await orchestrator.run("Create a math helper utility");

    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();

    const memManager = new ProjectMemoryManager(testDir);
    const resumeInfo = memManager.getResumeInfo();
    expect(resumeInfo.hasMemory).toBe(true);
    expect(resumeInfo.lastSummary).toBeDefined();
  });

  it("stops before coding when the safe edit preview is rejected", async () => {
    const originalPackage = readFileSync(join(testDir, "package.json"), "utf-8");
    let previewWasShown = false;
    const orchestrator = new AgentOrchestrator({
      cwd: testDir,
      providerConfig: { provider: "mock", model: "mock-coding-model" },
      planProviderConfig: { provider: "mock", model: "mock-fast-model" },
      onPlanReady: async (preview) => {
        previewWasShown = true;
        expect(preview.rawPlan.length).toBeGreaterThan(0);
        expect(preview.verificationCommands).toEqual(["npm test"]);
        return false;
      },
    });

    const result = await orchestrator.run("Add a settings route");
    expect(previewWasShown).toBe(true);
    expect(result.summary).toContain("cancelled before any files were changed");
    expect(result.filesModified).toEqual([]);
    expect(readFileSync(join(testDir, "package.json"), "utf-8")).toBe(originalPackage);
    expect(existsSync(join(testDir, ".codexa"))).toBe(false);
  });

  it("creates a read-only plan without creating CODEXA metadata or changing files", async () => {
    const orchestrator = new AgentOrchestrator({
      cwd: testDir,
      providerConfig: { provider: "mock", model: "mock-coding-model" },
      planProviderConfig: { provider: "mock", model: "mock-fast-model" },
    });

    const originalPackage = readFileSync(join(testDir, "package.json"), "utf-8");
    const result = await orchestrator.plan("Suggest a calculator improvement");

    expect(result.plan).toBeDefined();
    expect(readFileSync(join(testDir, "package.json"), "utf-8")).toBe(originalPackage);
    expect(existsSync(join(testDir, ".codexa"))).toBe(false);
  });
});
