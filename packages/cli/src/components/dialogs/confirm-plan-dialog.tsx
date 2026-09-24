import type { SafeEditPreview } from "@codexa/agent";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import { useDialog } from "../../providers/dialog";
import { useTheme } from "../../providers/theme";

type Props = {
  preview: SafeEditPreview;
  onConfirm: (approved: boolean) => void;
};

/** A deliberate pause between planning and project edits. */
export function ConfirmPlanDialogContent({ preview, onConfirm }: Props) {
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
        Safe edit preview
      </text>
      <text attributes={TextAttributes.DIM}>
        No project files have been changed. Review the complete scope before continuing.
      </text>
      <scrollbox height={18} borderStyle="single" borderColor="yellow" paddingX={1} paddingY={1}>
        <box flexDirection="column" gap={1}>
          <text fg="yellow" attributes={TextAttributes.BOLD}>
            Files to change:
          </text>
          {preview.files.length > 0 ? (
            preview.files.map((file) => <text key={file}> - {file}</text>)
          ) : (
            <text fg="red"> - No files identified — cancel and refine the request</text>
          )}

          <text fg={colors.primary} attributes={TextAttributes.BOLD}>
            Plan:
          </text>
          {preview.steps.map((step, index) => (
            <text key={`${index}:${step}`}> - {step}</text>
          ))}
          {preview.steps.length === 0 && (
            <text fg="yellow"> - Review and implement the request</text>
          )}

          <text fg="green" attributes={TextAttributes.BOLD}>
            Verification:
          </text>
          {preview.verificationCommands.length > 0 ? (
            preview.verificationCommands.map((command) => <text key={command}> - {command}</text>)
          ) : (
            <text fg="yellow"> - No test command detected</text>
          )}
        </box>
      </scrollbox>
      <text attributes={TextAttributes.BOLD}>Continue? y/n</text>
      <box flexDirection="row" gap={3} marginTop={1}>
        <box backgroundColor={colors.selection} paddingX={2} onMouseDown={() => resolve(true)}>
          <text fg="black" attributes={TextAttributes.BOLD}>
            [y] Continue
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
