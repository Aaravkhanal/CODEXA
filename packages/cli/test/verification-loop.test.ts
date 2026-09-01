import { describe, expect, it } from "bun:test";
import { detectVerificationCommand, runVerificationCommand } from "../src/lib/verification-loop";

describe("Post-Edit Verification Loop", () => {
  it("detects verification command in project directory", () => {
    const cmd = detectVerificationCommand(process.cwd());
    expect(cmd).toBeString();
    expect(cmd).toContain("check");
  });

  it("executes verification command and captures output", async () => {
    const res = await runVerificationCommand(process.cwd(), "echo 'test pass'");
    expect(res).not.toBeNull();
    expect(res?.passed).toBe(true);
    expect(res?.stdout).toBe("test pass");
  });
});
