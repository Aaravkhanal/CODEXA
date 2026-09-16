import { describe, expect, it } from "bun:test";
import { isDockerAvailable, resolveSandboxConfig } from "../src/lib/sandbox";
import { evaluateCommandPermission, shouldAutoApproveTool } from "../src/lib/permission-manager";
import { Mode } from "@codexa/shared";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInsideCwd } from "../src/lib/local-tools";

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

  it("resolves default hardened sandbox configuration with network isolation", () => {
    const config = resolveSandboxConfig(process.cwd());
    expect(config.network).toBe("none");
    expect(config.cpus).toBe("2");
    expect(config.memory).toBe("2g");
  });

  it("rejects filesystem paths that escape through a symlink", () => {
    const root = mkdtempSync(join(tmpdir(), "codexa-sandbox-"));
    const outside = mkdtempSync(join(tmpdir(), "codexa-outside-"));
    mkdirSync(join(root, "project"));
    symlinkSync(outside, join(root, "project", "linked"));
    expect(() => resolveInsideCwd("linked/escaped.txt", join(root, "project"))).toThrow("resolves outside");
  });
});
