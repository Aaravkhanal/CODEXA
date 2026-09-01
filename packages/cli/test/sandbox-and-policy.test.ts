import { describe, expect, it } from "bun:test";
import { isDockerAvailable } from "../src/lib/sandbox";
import { evaluateCommandPermission, shouldAutoApproveTool } from "../src/lib/permission-manager";
import { Mode } from "@codexa/shared";

describe("Phase 2 — Sandboxed Execution & Per-Command Policy", () => {
  it("checks Docker availability", () => {
    const available = isDockerAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("evaluates per-command approval actions with fail-closed rules", () => {
    // safe tool -> always_allow
    expect(evaluateCommandPermission("readFile", { path: "src/index.ts" })).toBe("always_allow");

    // PLAN mode write tool -> deny
    expect(evaluateCommandPermission("writeFile", { path: "src/index.ts" }, Mode.PLAN)).toBe("deny");

    // Destructive pattern -> deny
    expect(evaluateCommandPermission("bash", { command: "rm -rf /" }, Mode.BUILD)).toBe("deny");

    // Unlisted write tool in BUILD mode -> ask (fail-closed default)
    expect(evaluateCommandPermission("writeFile", { path: "src/index.ts" }, Mode.BUILD)).toBe("ask");
  });

  it("evaluates shouldAutoApproveTool under globalAutoApprove and PLAN mode restrictions", () => {
    expect(shouldAutoApproveTool("readFile", { path: "src/index.ts" })).toBe(true);
    expect(shouldAutoApproveTool("writeFile", { path: "src/index.ts" }, false, Mode.PLAN)).toBe(false);
    expect(shouldAutoApproveTool("writeFile", { path: "src/index.ts" }, true, Mode.BUILD)).toBe(true);
  });
});
