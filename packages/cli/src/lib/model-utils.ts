import type { SupportedProvider, SupportedChatModelId } from "@codexa/shared";
import { SUPPORTED_CHAT_MODELS } from "@codexa/shared";

/**
 * Resolves the provider name for a given model ID.
 * Falls back to "openai" for unknown models.
 */
export function getProviderForModel(modelId: SupportedChatModelId | string): SupportedProvider {
  const found = SUPPORTED_CHAT_MODELS.find((m) => m.id === modelId);
  return found?.provider ?? "openai";
}
