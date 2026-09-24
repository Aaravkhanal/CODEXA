import { describe, expect, it } from "bun:test";
import { printDoctorReport, runDoctorChecks } from "../src/lib/doctor";

describe("CODEXA Doctor Diagnostics", () => {
  it("runs all doctor checks and returns valid results structure", async () => {
    const report = await runDoctorChecks(process.cwd(), { verifyModelConnection: false });
    expect(report.results).toBeArray();
    expect(report.results.length).toBeGreaterThanOrEqual(3);

    const versionCheck = report.results.find((r) => r.name === "CLI & runtime");
    expect(versionCheck).toBeDefined();
    expect(versionCheck?.passed).toBe(true);

    const apiCheck = report.results.find((r) => r.name === "Credentials");
    expect(apiCheck).toBeDefined();

    expect(report.results.find((r) => r.name === "Selected model")).toBeDefined();
    expect(report.results.find((r) => r.name === "Git repository")?.passed).toBe(true);
    expect(report.results.find((r) => r.name === "Write permissions")?.passed).toBe(true);
    expect(report.results.find((r) => r.name === "Package manager")?.passed).toBe(true);
    expect(report.results.find((r) => r.name === "Test command")?.message).toContain("bun test");
    expect(report.results.find((r) => r.name === "Install health")).toBeDefined();
    expect(report.results.find((r) => r.name === "MCP configuration")).toBeDefined();
  });

  it("emits a machine-readable report for automation", async () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => output.push(String(value));

    try {
      const passed = await printDoctorReport(process.cwd(), true, {
        verifyModelConnection: false,
      });
      const report = JSON.parse(output.join("\n"));
      expect(typeof passed).toBe("boolean");
      expect(report).toHaveProperty("allPassed");
      expect(report.results).toBeArray();
    } finally {
      console.log = originalLog;
    }
  });
});
