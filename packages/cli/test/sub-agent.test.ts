import { describe, expect, it } from "bun:test";
import { spawnSubAgent } from "../src/lib/sub-agent";

describe("Sub-Agent Delegation", () => {
  it("returns a passing result for a valid verifyCommand", async () => {
    const result = await spawnSubAgent(
      {
        id: "test-echo-task",
        goal: "Echo hello world",
        cwd: process.cwd(),
        maxTokens: 500,
        verifyCommand: "echo 'hello world'",
        allowWrites: false,
      },
      "parent-session-test",
    );

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("hello world");
    expect(result.timelineEvents.length).toBe(2);
    expect(result.timelineEvents[0]!.phase).toBe("started");
    expect(result.timelineEvents[1]!.phase).toBe("completed");
    expect(result.timelineEvents[1]!.status).toBe("verified");
  });

  it("returns a failing result for a failing verifyCommand", async () => {
    const result = await spawnSubAgent(
      {
        id: "test-fail-task",
        goal: "Run a command that will fail",
        cwd: process.cwd(),
        maxTokens: 100,
        verifyCommand: "exit 1",
        allowWrites: false,
      },
      "parent-session-test",
    );

    expect(result.passed).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.timelineEvents[1]!.status).toBe("failed");
  });

  it("returns a passing planning result when no verifyCommand is given", async () => {
    const result = await spawnSubAgent(
      {
        id: "test-plan-task",
        goal: "Plan refactoring of the auth module",
        cwd: process.cwd(),
        maxTokens: 1000,
        allowWrites: false,
      },
      "parent-session-test",
    );

    expect(result.passed).toBe(true);
    expect(result.output).toContain("Goal registered");
    expect(result.timelineEvents[1]!.status).toBe("verified");
  });

  it("fails gracefully when cwd does not exist", async () => {
    const result = await spawnSubAgent(
      {
        id: "test-bad-cwd",
        goal: "Task in nonexistent directory",
        cwd: "/nonexistent/path/that/does/not/exist",
        maxTokens: 100,
      },
      "parent-session-test",
    );

    expect(result.passed).toBe(false);
    expect(result.output).toContain("does not exist");
    expect(result.timelineEvents[0]!.status).toBe("failed");
  });

  it("handles LiveAgentContext with server fallback gracefully", async () => {
    const result = await spawnSubAgent(
      {
        id: "test-live-fallback",
        goal: "Fix bug in calculation module",
        cwd: process.cwd(),
        maxTokens: 500,
        verifyCommand: "echo 'verified live task'",
      },
      "parent-session-test",
      {
        apiUrl: "http://127.0.0.1:9999", // non-existent server to trigger fallback
        apiKey: "test-key",
      },
    );

    expect(result.passed).toBe(true); // verifyCommand passes during fallback
    expect(result.output).toContain("Falling back to verification step");
    expect(result.output).toContain("verified live task");
  });
});
