import { useCallback, useState } from "react";
import { AgentOrchestrator, type ProviderConfig } from "@codexa/agent";
import type { ModeType, SupportedChatModelId } from "@codexa/shared";
import { getApiKey } from "../lib/api-keys";
import { getProviderForModel } from "../lib/model-utils";
import { cliArgs } from "../lib/cli-args";
import type { Message } from "./use-chat";

type SubmitParams = {
  userText: string;
  mode: ModeType;
  model: SupportedChatModelId;
};

function message(id: string, role: "user" | "assistant", text: string, metadata: SubmitParams): Message {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { mode: metadata.mode, model: metadata.model },
  } as Message;
}

/**
 * Runs the agent in-process when the hosted session API is unavailable.
 * Provider keys remain local and are sent only to the selected AI provider.
 */
export function useLocalAgentChat(options?: {
  askConfirmation?: (toolName: string, details: string) => Promise<boolean>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<"ready" | "streaming">("ready");
  const [error, setError] = useState<Error | undefined>();

  const submit = useCallback(async (params: SubmitParams) => {
    const provider = getProviderForModel(params.model);
    const apiKey = getApiKey(provider);
    if (!apiKey) {
      setError(new Error(`No ${provider} API key is configured for ${params.model}.`));
      return;
    }

    const turnId = crypto.randomUUID();
    setError(undefined);
    setMessages((current) => [...current, message(`${turnId}:user`, "user", params.userText, params)]);
    setStatus("streaming");

    try {
      const agent = new AgentOrchestrator({
        cwd: process.cwd(),
        providerConfig: { provider, apiKey, model: params.model } as ProviderConfig,
        autoApprove: cliArgs.autoApprove,
        onConfirmDangerous: async (command, reason) =>
          options?.askConfirmation?.(command, reason) ?? false,
      });
      const result = await agent.run(params.userText);
      const summary = result.success
        ? result.summary || "Task completed successfully."
        : `Task failed: ${result.summary}`;
      setMessages((current) => [
        ...current,
        message(`${turnId}:assistant`, "assistant", summary, params),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setStatus("ready");
    }
  }, [options]);

  return { messages, status, submit, error, abort: () => {}, interrupt: () => {} };
}
