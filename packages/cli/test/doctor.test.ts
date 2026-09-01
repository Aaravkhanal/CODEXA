import { describe, expect, it } from "bun:test";
import { runDoctorChecks } from "../src/lib/doctor";

describe("CODEXA Doctor Diagnostics", () => {
  it("runs all doctor checks and returns valid results structure", async () => {
    const report = await runDoctorChecks(process.cwd());
    expect(report.results).toBeArray();
    expect(report.results.length).toBeGreaterThanOrEqual(3);

    const versionCheck = report.results.find((r) => r.name === "CLI & Runtime Version");
    expect(versionCheck).toBeDefined();
    expect(versionCheck?.passed).toBe(true);

    const apiCheck = report.results.find((r) => r.name === "API Keys Storage");
    expect(apiCheck).toBeDefined();

    const mcpCheck = report.results.find((r) => r.name === "MCP Configuration");
    expect(mcpCheck).toBeDefined();
  });
});
