import { useCallback } from "react";
import { useNavigate } from "react-router";
import { Header } from "../components/header";
import { InputBar } from "../components/input-bar";
import { usePromptConfig } from "../providers/prompt-config";
import { TextAttributes } from "@opentui/core";
import { hasApiKey } from "../lib/api-keys";
import { useDialog } from "../providers/dialog";
import { AddApiKeyDialogContent } from "../components/dialogs/add-api-key-dialog";
import { ModelsDialogContent } from "../components/dialogs/models-dialog";
import { SUPPORTED_CHAT_MODELS } from "@codexa/shared";
import { useTheme } from "../providers/theme";

export function Home() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const { colors } = useTheme();
  const { mode, model, setModel } = usePromptConfig();

  const provider = model.startsWith("claude") ? "anthropic" : "openai";
  const keyConfigured = hasApiKey(provider);

  const openAgentSetup = useCallback(() => {
    dialog.open({
      title: "Configure Agent AI Model & API Key",
      children: (
        <AddApiKeyDialogContent
          initialModelId={model}
          onSaved={() => dialog.close()}
        />
      ),
    });
  }, [dialog, model]);

  const openModelSelector = useCallback(() => {
    dialog.open({
      title: "Select Agent AI Model",
      children: (
        <ModelsDialogContent
          models={SUPPORTED_CHAT_MODELS.map((m) => m.id)}
          onSelectModel={(newModel) => setModel(newModel)}
        />
      ),
    });
  }, [dialog, setModel]);

  const handleSubmit = useCallback(
    (text: string) => {
      const currentProvider = model.startsWith("claude") ? "anthropic" : "openai";
      if (!hasApiKey(currentProvider)) {
        dialog.open({
          title: `Setup ${currentProvider.toUpperCase()} API Key for ${model}`,
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
        <box
          flexDirection="column"
          borderStyle="single"
          borderColor={keyConfigured ? colors.primary : colors.error}
          paddingX={2}
          paddingY={1}
          gap={1}
        >
          <box flexDirection="row" justifyContent="space-between" alignItems="center">
            <text fg={colors.primary} attributes={TextAttributes.BOLD}>
              ⚡ AGENT &amp; AI MODEL CONFIGURATION
            </text>
            {keyConfigured ? (
              <text fg={colors.success}>✓ API Key Active ({provider.toUpperCase()})</text>
            ) : (
              <text fg={colors.error}>! API Key Required</text>
            )}
          </box>

          <box flexDirection="row" gap={2} alignItems="center">
            <text fg="white">
              Agent Model: <text fg={colors.info} attributes={TextAttributes.BOLD}>{model}</text>
            </text>
            <text fg={colors.dimSeparator}>|</text>
            <text fg="white">
              Provider: <text fg="yellow">{provider}</text>
            </text>
          </box>

          <box flexDirection="row" gap={2} marginTop={1}>
            <box
              onMouseDown={openAgentSetup}
              backgroundColor={colors.selection}
              paddingX={1}
            >
              <text fg="black" attributes={TextAttributes.BOLD}>🔑 Configure API Key</text>
            </box>
            <box
              onMouseDown={openModelSelector}
              backgroundColor={colors.selection}
              paddingX={1}
            >
              <text fg="black" attributes={TextAttributes.BOLD}>🤖 Switch Agent Model</text>
            </box>
          </box>
        </box>

        <InputBar onSubmit={handleSubmit} />
        <box flexDirection="row" gap={1} flexShrink={0} marginLeft="auto">
          <text>tab</text>
          <text attributes={TextAttributes.DIM}>agents</text>
        </box>
      </box>
    </box>
  );
}
