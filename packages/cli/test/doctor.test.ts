import { describe, expect, it } from "bun:test";
import { printDoctorReport, runDoctorChecks } from "../src/lib/doctor";

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

  it("emits a machine-readable report for automation", async () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => output.push(String(value));

    try {
      const passed = await printDoctorReport(process.cwd(), true);
      const report = JSON.parse(output.join("\n"));
      expect(typeof passed).toBe("boolean");
      expect(report).toHaveProperty("allPassed");
      expect(report.results).toBeArray();
    } finally {
      console.log = originalLog;
    }
  });
});
