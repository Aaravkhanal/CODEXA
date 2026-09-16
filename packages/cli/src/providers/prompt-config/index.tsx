import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { 
  DEFAULT_CHAT_MODEL_ID, 
  findSupportedChatModel,
  Mode,
  type ModeType,
  type SupportedChatModelId, 
} from "@codexa/shared";
import { cliArgs } from "../../lib/cli-args";
import { getActiveProviderConfig } from "../../lib/global-config";

type PromptConfigContextValue = {
  mode: ModeType;
  toggleMode: () => void;
  setMode: (mode: ModeType) => void;
  model: SupportedChatModelId;
  setModel: (model: SupportedChatModelId) => void;
};

const PromptConfigContext = createContext<PromptConfigContextValue | null>(null);

export function usePromptConfig(): PromptConfigContextValue {
  const value = useContext(PromptConfigContext);
  if (!value) {
    throw new Error("usePromptConfig must be used within a PromptConfigProvider");
  }
  return value;
}

type PromptConfigProviderProps = {
  children: ReactNode;
};

function getInitialModel(): SupportedChatModelId {
  const configuredModel = getActiveProviderConfig(cliArgs.profile)?.profile.model;
  const requestedModel = cliArgs.model ?? configuredModel;
  const supportedModel = requestedModel ? findSupportedChatModel(requestedModel) : undefined;
  return supportedModel?.id ?? DEFAULT_CHAT_MODEL_ID;
}

export function PromptConfigProvider({ children }: PromptConfigProviderProps) {
  const [mode, setMode] = useState<ModeType>(
    cliArgs.executionMode === "PLAN" ? Mode.PLAN : Mode.BUILD,
  );
  const [model, setModel] = useState<SupportedChatModelId>(getInitialModel);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === Mode.BUILD ? Mode.PLAN : Mode.BUILD));
  }, []);

  const value: PromptConfigContextValue = {
    mode,
    toggleMode,
    setMode,
    model,
    setModel,
  };

  return (
    <PromptConfigContext.Provider value={value}>
      {children}
    </PromptConfigContext.Provider>
  );
}
