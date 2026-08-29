import { useCallback } from "react";
import { useNavigate } from "react-router";
import { Header } from "../components/header";
import { InputBar } from "../components/input-bar";
import { usePromptConfig } from "../providers/prompt-config";
import { TextAttributes } from "@opentui/core";
import { hasApiKey } from "../lib/api-keys";
import { useDialog } from "../providers/dialog";
import { AddApiKeyDialogContent } from "../components/dialogs/add-api-key-dialog";

export function Home() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const { mode, model } = usePromptConfig();

  const handleSubmit = useCallback(
    (text: string) => {
      const provider = model.startsWith("claude") ? "anthropic" : "openai";
      if (!hasApiKey(provider)) {
        dialog.open({
          title: `Setup ${provider.toUpperCase()} API Key for ${model}`,
          children: (
            <AddApiKeyDialogContent
              initialModelId={model}
              onSaved={() => {
                navigate("/sessions/new", { state: { message: text, mode, model } });
              }}
            />
          ),
        });
        return;
      }
      navigate("/sessions/new", { state: { message: text, mode, model } });
    },
    [navigate, mode, model, dialog],
  );

  return (
    <box
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
      gap={2}
      position="relative"
      width="100%"
      height="100%"
    >
      <Header />
      <box width="100%" maxWidth={78} paddingX={2} flexDirection="column" gap={1}>
        <InputBar onSubmit={handleSubmit} />
        <box flexDirection="row" gap={1} flexShrink={0} marginLeft="auto">
          <text>tab</text>
          <text attributes={TextAttributes.DIM}>agents</text>
        </box>
      </box>
    </box>
  );
}
