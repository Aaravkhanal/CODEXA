import { describe, expect, it } from "bun:test";
import { createSafeEditPreview, formatSafeEditPreview } from "../src/orchestrator/index.ts";

describe("Safe edit preview", () => {
  it("extracts exact files and concise plan steps from the planner response", () => {
    const preview = createSafeEditPreview(
      `Files to change:
- src/App.tsx
- package.json

Plan:
- add route
- update tests`,
      ["src/App.tsx", "package.json"],
      ["npm test"],
    );

    expect(preview.files).toEqual(["src/App.tsx", "package.json"]);
    expect(preview.steps).toEqual(["add route", "update tests"]);
    expect(preview.verificationCommands).toEqual(["npm test"]);
    expect(formatSafeEditPreview(preview)).toContain("Files to change:\n- src/App.tsx");
    expect(formatSafeEditPreview(preview)).toContain("Verification:\n- npm test");
  });

  it("recovers known and newly proposed file paths from an unstructured plan", () => {
    const preview = createSafeEditPreview(
      "Update `src/App.tsx` and add `src/routes/settings.tsx`, then verify behavior.",
      ["src/App.tsx"],
      [],
    );

    expect(preview.files).toEqual(["src/App.tsx", "src/routes/settings.tsx"]);
    expect(formatSafeEditPreview(preview)).toContain("No verification command detected");
  });
});
