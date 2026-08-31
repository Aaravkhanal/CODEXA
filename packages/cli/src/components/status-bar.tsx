import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
import { usePromptConfig } from "../providers/prompt-config";
import { Mode } from "@codexa/shared";
import { useParams } from "react-router";
import { useCodexaLens } from "../providers/codexalens";
import { useMemo } from "react";

export function StatusBar() {
  const { mode, model } = usePromptConfig();
  const { colors } = useTheme();
  const { id: sessionId } = useParams();
  const { getActivity } = useCodexaLens();

  const activeActivity = useMemo(() => {
    if (!sessionId) return null;
    const events = getActivity(sessionId);
    const started = events.filter((e) => e.phase === "started");
    const completed = new Set(
      events.filter((e) => e.phase === "completed").map((e) => e.toolCallId)
    );
    const active = started.findLast((e) => !completed.has(e.toolCallId));
    return active ? active.summary : null;
  }, [sessionId, getActivity]);

  return (
    <box flexDirection="row" gap={1}>
      <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>
        {mode === Mode.PLAN ? "Plan" : "Build"}
      </text>
      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
        ›
      </text>
      <text>{model}</text>
      {activeActivity && (
        <>
          <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
            |
          </text>
          <text fg={colors.info} attributes={TextAttributes.BOLD}>
            ▶ {activeActivity}...
          </text>
        </>
      )}
    </box>
  );
}
