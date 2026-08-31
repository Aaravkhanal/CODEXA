import { useCallback, useMemo, useEffect } from "react";
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
import { detectProject } from "../lib/project-detector";
import { cliArgs } from "../lib/cli-args";
import { getProviderForModel } from "../lib/model-utils";

export function Home() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const { colors } = useTheme();
  const { mode, model, setModel } = usePromptConfig();

  const provider = getProviderForModel(model);
  const keyConfigured = hasApiKey(provider);

  const projectInfo = useMemo(() => detectProject(), []);

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

  useEffect(() => {
    if (cliArgs.mode === "setup") {
      openAgentSetup();
    } else if (cliArgs.mode !== "interactive") {
      let promptText = "";
      let initialMode = mode;

      if (cliArgs.mode === "review") {
        promptText = "review my current git diff and identify issues";
      } else if (cliArgs.mode === "scan") {
        promptText = "scan for security issues and potential bugs";
      } else if (cliArgs.mode === "explain") {
        promptText = `Explain this file: ${cliArgs.targetFile}`;
      } else if (cliArgs.mode === "plan") {
        promptText = cliArgs.taskPrompt || "";
        initialMode = "PLAN";
      } else if (cliArgs.mode === "task") {
        promptText = cliArgs.taskPrompt || "";
      }

      if (promptText) {
        const currentProvider = getProviderForModel(model);
        if (!hasApiKey(currentProvider)) {
          dialog.open({
            title: `Setup ${currentProvider.toUpperCase()} API Key for ${model}`,
            children: (
              <AddApiKeyDialogContent
                initialModelId={model}
                onSaved={() => {
                  dialog.close();
                  navigate("/sessions/new", { state: { message: promptText, mode: initialMode, model } });
                }}
              />
            ),
          });
        } else {
          navigate("/sessions/new", { state: { message: promptText, mode: initialMode, model } });
        }
      }
    }
  }, [navigate, mode, model, dialog, openAgentSetup]);

  const handleSubmit = useCallback(
    (text: string) => {
      const currentProvider = getProviderForModel(model);
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
      gap={1}
      position="relative"
      width="100%"
      height="100%"
    >
      <Header />
      <box width="100%" maxWidth={78} paddingX={2} flexDirection="column" gap={1}>
        {/* Project Intelligence Card */}
        <box
          flexDirection="column"
          borderStyle="single"
          borderColor={colors.dimSeparator}
          paddingX={2}
          paddingY={1}
          gap={1}
        >
          <text fg={colors.primary} attributes={TextAttributes.BOLD}>
            ╭──────────────────────────────────────────────╮
            │                 CODEXA                       │
            │        AI Coding Agent for your repo         │
            ╰──────────────────────────────────────────────╯
          </text>
          
          <box flexDirection="row" gap={1}>
            <text fg="white" attributes={TextAttributes.BOLD}>Project:</text>
            <text fg={colors.info}>{projectInfo.name}</text>
          </box>
          
          <box flexDirection="row" gap={1}>
            <text fg="white">Path:</text>
            <text attributes={TextAttributes.DIM}>{projectInfo.path}</text>
          </box>

          <box flexDirection="row" gap={2} marginTop={1}>
            <text fg="white">Detected:</text>
            {projectInfo.frameworks.map((fw) => (
              <text key={fw} fg="cyan">✓ {fw}</text>
            ))}
            {projectInfo.languages.map((lang) => (
              <text key={lang} fg="yellow">✓ {lang}</text>
            ))}
            {projectInfo.hasGit && <text fg="green">✓ Git repository</text>}
          </box>

          <box flexDirection="row" gap={2}>
            <text fg="white">Files: {projectInfo.fileCount}</text>
            <text fg={colors.dimSeparator}>|</text>
            <text fg="white">Package Manager: {projectInfo.packageManager}</text>
            <text fg={colors.dimSeparator}>|</text>
            <text fg="white">Test Framework: {projectInfo.testFramework}</text>
          </box>

          <box flexDirection="row" gap={1}>
            <text fg="white">Git Status:</text>
            <text fg={projectInfo.gitStatus === "clean" ? "green" : "yellow"}>
              {projectInfo.gitStatus}
            </text>
          </box>
        </box>

        {/* Model Setup config card */}
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

          <box flexDirection="row" gap={1} alignItems="center">
            <text fg="white">Agent Model: </text>
            <text fg={colors.info} attributes={TextAttributes.BOLD}>{model}</text>
            <text fg={colors.dimSeparator}> | </text>
            <text fg="white">Provider: </text>
            <text fg="yellow">{provider}</text>
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
