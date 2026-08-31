import { useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import { useDialog } from "../../providers/dialog";

type Props = {
  toolName: string;
  details: string;
  onConfirm: (allowed: boolean) => void;
};

export function ConfirmToolDialogContent({ toolName, details, onConfirm }: Props) {
  const { colors } = useTheme();
  const dialog = useDialog();

  useKeyboard((key) => {
    if (key.name === "y" || key.name === "return") {
      key.preventDefault();
      onConfirm(true);
      dialog.close();
    } else if (key.name === "n" || key.name === "escape") {
      key.preventDefault();
      onConfirm(false);
      dialog.close();
    }
  });

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="row" gap={1}>
        <text fg={colors.error} attributes={TextAttributes.BOLD}>⚠ WARNING: Destructive Command Requested</text>
      </box>

      <box paddingX={1} marginY={1}>
        <text fg="white">Codexa wants to run: </text>
        <text fg={colors.primary} attributes={TextAttributes.BOLD}>{toolName}</text>
      </box>

      {details ? (
        <box borderStyle="single" borderColor={colors.dimSeparator} paddingX={2} paddingY={1} marginY={1}>
          <text attributes={TextAttributes.DIM}>{details}</text>
        </box>
      ) : null}

      <box flexDirection="row" gap={3} marginTop={1}>
        <box backgroundColor={colors.selection} paddingX={2}>
          <text fg="black" attributes={TextAttributes.BOLD}>[y] Allow</text>
        </box>
        <box backgroundColor="red" paddingX={2}>
          <text fg="white" attributes={TextAttributes.BOLD}>[n] Cancel</text>
        </box>
      </box>

      <text attributes={TextAttributes.DIM} marginTop={1}>
        Press 'y' or Enter to allow, 'n' or Esc to cancel.
      </text>
    </box>
  );
}
export default ConfirmToolDialogContent;
