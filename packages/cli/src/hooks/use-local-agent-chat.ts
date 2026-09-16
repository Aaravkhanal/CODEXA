import { useCallback, useState } from "react";
import { AgentOrchestrator, createLanguageModel, type ProviderConfig } from "@codexa/agent";
import { generateText } from "ai";
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

function isSimpleConversation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized.length <= 220 && /^(hi|hello|hey|thanks|thank you|who are you|what can you do|how are you|good morning|good evening)\b/.test(normalized);
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
      const providerConfig = { provider, apiKey, model: params.model } as ProviderConfig;
      let summary: string;
      let totalTokensUsed: number;
      let durationMs: number;

      if (isSimpleConversation(params.userText)) {
        const startedAt = Date.now();
        const response = await generateText({
          model: createLanguageModel(providerConfig),
          system: "You are CODEXA, a concise and helpful coding assistant.",
          prompt: params.userText,
        });
        summary = response.text;
        totalTokensUsed = response.usage.totalTokens ?? 0;
        durationMs = Date.now() - startedAt;
      } else {
        const agent = new AgentOrchestrator({
          cwd: process.cwd(),
          providerConfig,
          autoApprove: cliArgs.autoApprove,
          onConfirmDangerous: async (command, reason) =>
            options?.askConfirmation?.(command, reason) ?? false,
        });
        const result = await agent.run(params.userText);
        summary = result.success
          ? result.summary || "Task completed successfully."
          : `Task failed: ${result.summary}`;
        totalTokensUsed = result.totalTokensUsed;
        durationMs = result.durationMs;
      }
      setMessages((current) => [
        ...current,
        {
          ...message(`${turnId}:assistant`, "assistant", summary, params),
          metadata: {
            mode: params.mode,
            model: params.model,
            usage: { totalTokens: totalTokensUsed } as any,
            durationMs,
          },
        } as Message,
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setStatus("ready");
    }
  }, [options]);

  return { messages, status, submit, error, abort: () => {}, interrupt: () => {} };
}
