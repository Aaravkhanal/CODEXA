import { useState, useCallback, useRef, useEffect } from "react";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { setApiKey } from "../../lib/api-keys";
import type { SupportedProvider } from "@codexa/shared";
import { useTheme } from "../../providers/theme";

const PROVIDERS: { id: SupportedProvider; label: string; placeholder: string }[] = [
  { id: "anthropic", label: "Anthropic  (claude-*)", placeholder: "sk-ant-api..." },
  { id: "openai", label: "OpenAI     (gpt-*)", placeholder: "sk-proj-..." },
];

export function AddApiKeyDialogContent({ onSaved }: { onSaved?: () => void }) {
  const dialog = useDialog();
  const toast = useToast();
  const { colors } = useTheme();
  const inputRef = useRef<any>(null);

  const [step, setStep] = useState<"select-provider" | "enter-key">("select-provider");
  const [selectedProvider, setSelectedProvider] = useState<{ id: SupportedProvider; placeholder: string } | null>(null);
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
    toast.show({ variant: "success", message: `${selectedProvider.id} API key saved to ~/.codexa/api-keys.json` });
    dialog.close();
    onSaved?.();
  }, [selectedProvider, dialog, toast, onSaved]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus?.();
    }
  }, [step]);

  if (step === "select-provider") {
    return (
      <box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
        <text>Select provider:</text>
        {PROVIDERS.map(({ id, label }, i) => (
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
          </box>
        ))}
        <text attributes={2} fg="gray">
          Keys stored in ~/.codexa/api-keys.json (mode 0600)
        </text>
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
      <text>
        Paste your <text fg="cyan">{selectedProvider?.id}</text> API key and press Enter:
      </text>
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
        borderStyle="single"
        borderColor="cyan"
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
