import { describe, expect, it } from "bun:test";
import { generateTimelineHtml, exportSessionTimeline } from "../src/lib/lens-export";
import { existsSync, unlinkSync } from "node:fs";

describe("CodexaLens HTML Exporter", () => {
  it("generates structured HTML timeline report", () => {
    const html = generateTimelineHtml({
      sessionId: "session-123",
      timestamp: "2026-09-01T21:00:00Z",
      durationMs: 12000,
      totalTokens: 1500,
      estimatedCostUsd: 0.015,
      events: [
        {
          id: "1:completed",
          toolCallId: "1",
          toolName: "writeFile",
          phase: "completed",
          status: "modified",
          filePaths: ["src/index.ts"],
          timestampMs: Date.now(),
          offsetMs: 1000,
          durationMs: 150,
          summary: "Modified src/index.ts",
        },
      ],
    });

    expect(html).toContain("CODEXA Session Activity Report");
    expect(html).toContain("session-123");
    expect(html).toContain("writeFile");
    expect(html).toContain("Modified src/index.ts");
  });

  it("exports HTML report to filesystem", async () => {
    const targetFile = "test-export-report.html";
    const path = await exportSessionTimeline("session-test", targetFile, []);
    expect(existsSync(path)).toBe(true);

    // cleanup
    unlinkSync(path);
  });
});
