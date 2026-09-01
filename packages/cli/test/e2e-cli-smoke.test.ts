import { spawnSync } from "node:child_process";
import { describe, expect, it } from "bun:test";

describe("CLI Terminal E2E Smoke Suite", () => {
  it("executes CLI --version and outputs version info", () => {
    const res = spawnSync("bun", ["run", "packages/cli/src/index.tsx", "--version"], {
      encoding: "utf-8",
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("codexa");
  });

  it("executes CLI --help and outputs usage manual", () => {
    const res = spawnSync("bun", ["run", "packages/cli/src/index.tsx", "--help"], {
      encoding: "utf-8",
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage:");
    expect(res.stdout).toContain("codexa [options]");
  });

  it("executes CLI --status and detects workspace project metadata", () => {
    const res = spawnSync("bun", ["run", "packages/cli/src/index.tsx", "--status"], {
      encoding: "utf-8",
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Project:");
    expect(res.stdout).toContain("Path:");
    expect(res.stdout).toContain("Package Manager:");
  });
});
