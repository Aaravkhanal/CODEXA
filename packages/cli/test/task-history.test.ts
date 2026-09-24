import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectMemoryManager } from "@codexa/agent";
import { parseCliArgs } from "../src/lib/cli-args";
import { createResumePrompt, resolveResumePrompt } from "../src/lib/history-cmd";

describe("local task history commands", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "codexa-history-test-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("parses history, resume, and rollback commands", () => {
    expect(parseCliArgs(["history"]).mode).toBe("history");
    expect(parseCliArgs(["resume", "session_123"])).toMatchObject({
      mode: "resume",
      sessionId: "session_123",
    });
    expect(parseCliArgs(["rollback", "cp-123"])).toMatchObject({
      mode: "rollback",
      subArgs: ["cp-123"],
    });
  });

  it("resolves the latest saved task into a continuation prompt", () => {
    const memory = new ProjectMemoryManager(cwd);
    memory.recordSessionSummary({
      sessionId: "session_123",
      timestamp: 123,
      task: "Add a settings route",
      summary: "Route added; tests still failing",
      filesModified: ["src/App.tsx"],
      testsRun: true,
      testsPassed: false,
    });

    const result = resolveResumePrompt(undefined, cwd);
    expect(result.error).toBeUndefined();
    expect(result.prompt).toContain("Original task: Add a settings route");
    expect(result.prompt).toContain("Tests: failed");
    const session = memory.getSession("session_123");
    expect(session).not.toBeNull();
    if (session) expect(createResumePrompt(session)).toContain("src/App.tsx");
  });

  it("returns a useful error when no task can be resumed", () => {
    expect(resolveResumePrompt(undefined, cwd).error).toContain("No saved tasks found");
  });
});
