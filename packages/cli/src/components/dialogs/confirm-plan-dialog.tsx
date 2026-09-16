import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import { useDialog } from "../../providers/dialog";
import { useTheme } from "../../providers/theme";

type Props = {
  plan: string;
  onConfirm: (approved: boolean) => void;
};

/** A deliberate pause between planning and project edits. */
export function ConfirmPlanDialogContent({ plan, onConfirm }: Props) {
  const { colors } = useTheme();
  const dialog = useDialog();
  const resolved = useRef(false);

  const resolve = (approved: boolean) => {
    if (resolved.current) return;
    resolved.current = true;
    onConfirm(approved);
    dialog.close();
  };

  useEffect(
    () => () => {
      if (!resolved.current) onConfirm(false);
    },
    [onConfirm],
  );

  useKeyboard((key) => {
    if (key.name === "y" || key.name === "return") {
      key.preventDefault();
      resolve(true);
    } else if (key.name === "n" || key.name === "escape") {
      key.preventDefault();
      resolve(false);
    }
  });

  return (
    <box flexDirection="column" gap={1}>
      <text fg={colors.primary} attributes={TextAttributes.BOLD}>
        Review the plan before CODEXA edits files
      </text>
      <text attributes={TextAttributes.DIM}>No project files have been changed yet.</text>
      <scrollbox
        height={14}
        borderStyle="single"
        borderColor={colors.dimSeparator}
        paddingX={1}
        paddingY={1}
      >
        <text>{plan}</text>
      </scrollbox>
      <box flexDirection="row" gap={3} marginTop={1}>
        <box backgroundColor={colors.selection} paddingX={2} onMouseDown={() => resolve(true)}>
          <text fg="black" attributes={TextAttributes.BOLD}>
            [y] Apply plan
          </text>
        </box>
        <box backgroundColor="red" paddingX={2} onMouseDown={() => resolve(false)}>
          <text fg="white" attributes={TextAttributes.BOLD}>
            [n] Cancel
          </text>
        </box>
      </box>
    </box>
  );
}
