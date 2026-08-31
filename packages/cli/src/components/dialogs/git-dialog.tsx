import { useState, useEffect } from "react";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";

type Props = {
  initialTab?: "status" | "diff";
};

export function GitDialogContent({ initialTab = "status" }: Props) {
  const [tab, setTab] = useState<"status" | "diff">(initialTab);
  const [content, setContent] = useState<string>("Loading git information...");
  const { colors } = useTheme();
  const dimensions = useTerminalDimensions();

  useEffect(() => {
    const gitDir = join(process.cwd(), ".git");
    if (!existsSync(gitDir)) {
      setContent("Not a Git repository");
      return;
    }

    try {
      if (tab === "status") {
        const stdout = execSync("git status", { encoding: "utf-8" });
        setContent(stdout || "No changes tracked");
      } else {
        const stdout = execSync("git diff", { encoding: "utf-8" });
        setContent(stdout || "No modifications (unstaged diff is empty)");
      }
    } catch (err: any) {
      setContent(`Failed to run git command: ${err.message}`);
    }
  }, [tab]);

  useKeyboard((key) => {
    if (key.name === "s") {
      key.preventDefault();
      setTab("status");
    } else if (key.name === "d") {
      key.preventDefault();
      setTab("diff");
    }
  });

  return (
    <box flexDirection="column" flexGrow={1} height="100%" gap={1}>
      {/* Tabs bar */}
      <box flexDirection="row" gap={2} paddingBottom={1} border={["bottom"]} borderColor={colors.dimSeparator}>
        <box
          backgroundColor={tab === "status" ? colors.primary : colors.selection}
          paddingX={2}
          onMouseDown={() => setTab("status")}
        >
          <text fg={tab === "status" ? "black" : "white"} attributes={TextAttributes.BOLD}>
            [S] Status
          </text>
        </box>
        <box
          backgroundColor={tab === "diff" ? colors.primary : colors.selection}
          paddingX={2}
          onMouseDown={() => setTab("diff")}
        >
          <text fg={tab === "diff" ? "black" : "white"} attributes={TextAttributes.BOLD}>
            [D] Diff
          </text>
        </box>
      </box>

      {/* Main output */}
      <scrollbox flexGrow={1} minHeight={5} width="100%">
        <box paddingY={1}>
          {content.split("\n").map((line, idx) => {
            let fgColor = "white";
            if (tab === "diff") {
              if (line.startsWith("+")) fgColor = "green";
              else if (line.startsWith("-")) fgColor = "red";
              else if (line.startsWith("@@")) fgColor = "cyan";
            } else if (tab === "status") {
              if (line.includes("modified:")) fgColor = "yellow";
              else if (line.includes("new file:")) fgColor = "green";
              else if (line.includes("deleted:")) fgColor = "red";
            }
            return (
              <text key={idx} fg={fgColor}>
                {line}
              </text>
            );
          })}
        </box>
      </scrollbox>

      <box border={["top"]} borderColor={colors.dimSeparator} paddingTop={1} flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.DIM}>Press 's' for Status, 'd' for Diff.</text>
        <text fg={colors.info}>Terminal: {dimensions.width}x{dimensions.height}</text>
      </box>
    </box>
  );
}

export default GitDialogContent;
