import { useState, useCallback, useRef, useEffect } from "react";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { setApiKey, hasApiKey } from "../../lib/api-keys";
import type { SupportedChatModelId, SupportedProvider } from "@codexa/shared";
import { useTheme } from "../../providers/theme";
import { usePromptConfig } from "../../providers/prompt-config";

const PROVIDERS: { id: SupportedProvider; label: string; placeholder: string }[] = [
  { id: "anthropic", label: "Anthropic  (claude-*)", placeholder: "sk-ant-api..." },
  { id: "openai", label: "OpenAI     (gpt-*)", placeholder: "sk-proj-..." },
  { id: "google", label: "Google     (gemini-*)", placeholder: "AIza..." },
  { id: "groq", label: "Groq       (llama-*)", placeholder: "gsk_..." },
];

export type AddApiKeyDialogContentProps = {
  initialProvider?: SupportedProvider;
  initialModelId?: SupportedChatModelId;
  onSaved?: () => void;
};

export function AddApiKeyDialogContent({
  initialProvider,
  initialModelId,
  onSaved,
}: AddApiKeyDialogContentProps) {
  const dialog = useDialog();
  const toast = useToast();
  const { colors } = useTheme();
  const { setModel } = usePromptConfig();
  const inputRef = useRef<any>(null);

  const defaultProvider =
    initialProvider ??
    (initialModelId?.startsWith("claude")
      ? "anthropic"
      : initialModelId
        ? "openai"
        : null);

  const [step, setStep] = useState<"select-provider" | "enter-key">(
    defaultProvider ? "enter-key" : "select-provider"
  );
  const [selectedProvider, setSelectedProvider] = useState<{
    id: SupportedProvider;
    placeholder: string;
  } | null>(
    defaultProvider
      ? PROVIDERS.find((p) => p.id === defaultProvider) ?? PROVIDERS[0]!
      : null
  );
  const [selectedIdx, setSelectedIdx] = useState(0);

  const handleSelectProvider = useCallback((provider: typeof PROVIDERS[number]) => {
    setSelectedProvider({ id: provider.id, placeholder: provider.placeholder });
    setStep("enter-key");
  }, []);

  const handleSave = useCallback((rawKey: string) => {
    if (!selectedProvider || !rawKey.trim()) {
      toast.show({ variant: "error", message: "API key cannot be empty" });
      return;
    }
    setApiKey(selectedProvider.id, rawKey.trim());
    if (initialModelId) {
      setModel(initialModelId);
    }
    toast.show({
      variant: "success",
      message: `${selectedProvider.id} API key saved to ~/.codexa/api-keys.json`,
    });
    dialog.close();
    onSaved?.();
  }, [selectedProvider, initialModelId, setModel, dialog, toast, onSaved]);

  useEffect(() => {
    if (step === "enter-key" && inputRef.current) {
      inputRef.current.focus?.();
    }
  }, [step]);

  if (step === "select-provider") {
    return (
      <box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
        <text fg="cyan" attributes={1}>Setup AI Model Agent & API Keys</text>
        <text>Select AI Provider / Model Family:</text>
        {PROVIDERS.map(({ id, label }, i) => {
          const isSaved = hasApiKey(id);
          return (
            <box
              key={id}
              flexDirection="row"
              gap={1}
              height={1}
              backgroundColor={selectedIdx === i ? colors.selection : undefined}
              onMouseMove={() => setSelectedIdx(i)}
              onMouseDown={() => handleSelectProvider(PROVIDERS[i]!)}
            >
              <text fg="cyan">›</text>
              <text fg="white">{label}</text>
              {isSaved ? (
                <text fg="green">  ✓ Key Configured</text>
              ) : (
                <text fg="yellow">  ! Key Required</text>
              )}
            </box>
          );
        })}
        <text attributes={2} fg="gray">
          Keys stored locally in ~/.codexa/api-keys.json (mode 0600)
        </text>
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
      <text fg="cyan" attributes={1}>{`Setup ${selectedProvider?.id?.toUpperCase() ?? ""} API Key`}</text>
      <box flexDirection="row" gap={1}>
        <text fg="white">Paste your</text>
        <text fg="cyan">{selectedProvider?.id}</text>
        <text fg="white">API key and press Enter:</text>
      </box>
      <input
        ref={inputRef}
        focused
        placeholder={selectedProvider?.placeholder ?? "sk-..."}
        onContentChange={() => {
          const val = (inputRef.current as any)?.value ?? "";
          if (val.includes("\n")) {
            handleSave(val.replace(/\n/g, "").trim());
          }
        }}
        width={60}
      />
      <text attributes={2} fg="gray">
        Press Enter to save • Ctrl+C to cancel
      </text>
      <box
        flexDirection="row"
        gap={2}
        height={1}
        marginTop={1}
        onMouseDown={() => setStep("select-provider")}
      >
        <text fg="gray">← Back</text>
      </box>
    </box>
  );
}
