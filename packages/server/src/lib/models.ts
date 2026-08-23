import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  findSupportedChatModel,
  type SupportedChatModel,
  type SupportedChatModelId,
  type SupportedProvider,
} from "@codexa/shared";
import type { LanguageModel } from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";

type AnthropicModelId = Extract<SupportedChatModel, { provider: "anthropic" }>["id"];
type OpenAIModelId = Extract<SupportedChatModel, { provider: "openai" }>["id"];

export type ClientApiKeys = {
  anthropic?: string;
  openai?: string;
};

export type ResolvedModel = {
  model: LanguageModel;
  provider: SupportedProvider;
  modelId: SupportedChatModelId;
  providerOptions?: ProviderOptions;
};

const ANTHROPIC_PROVIDER_OPTIONS: Partial<Record<AnthropicModelId, ProviderOptions>> = {
  "claude-opus-4-6": {
    anthropic: {
      thinking: { type: "enabled", budgetTokens: 10000 },
    },
  },
  "claude-sonnet-4-6": {
    anthropic: {
      thinking: { type: "enabled", budgetTokens: 10000 },
    },
  },
  "claude-haiku-4-5": {
    anthropic: {
      thinking: { type: "enabled", budgetTokens: 10000 },
    },
  },
};

const OPENAI_PROVIDER_OPTIONS: Partial<Record<OpenAIModelId, ProviderOptions>> = {
  "gpt-5.4": {
    openai: { reasoningEffort: "high", maxCompletionTokens: 10000 },
  },
  "gpt-5.4-mini": {
    openai: { reasoningEffort: "medium", maxCompletionTokens: 10000 },
  },
  "gpt-5.4-nano": {
    openai: { reasoningEffort: "low", maxCompletionTokens: 10000 },
  },
};

function assertUnsupportedProvider(provider: never): never {
  throw new Error(`Unsupported provider: ${provider}`);
}

function resolveAnthropicModel(modelId: AnthropicModelId, apiKey?: string): ResolvedModel {
  const provider = createAnthropic({
    apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
  });
  let sdkModelId: string = modelId;
  if (modelId === "claude-3-5-sonnet") sdkModelId = "claude-3-5-sonnet-latest";
  else if (modelId === "claude-3-5-haiku") sdkModelId = "claude-3-5-haiku-latest";
  return {
    model: provider(sdkModelId),
    provider: "anthropic",
    modelId,
    providerOptions: ANTHROPIC_PROVIDER_OPTIONS[modelId],
  };
}

function resolveOpenAIModel(modelId: OpenAIModelId, apiKey?: string): ResolvedModel {
  const provider = createOpenAI({
    apiKey: apiKey ?? process.env.OPENAI_API_KEY,
  });
  let sdkModelId: string = modelId;
  if (modelId === "gpt-4o") sdkModelId = "gpt-4o";
  else if (modelId === "gpt-4o-mini") sdkModelId = "gpt-4o-mini";
  return {
    model: provider(sdkModelId),
    provider: "openai",
    modelId,
    providerOptions: OPENAI_PROVIDER_OPTIONS[modelId],
  };
}

function resolveSupportedChatModel(model: SupportedChatModel, clientKeys: ClientApiKeys): ResolvedModel {
  const provider = model.provider;
  switch (provider) {
    case "anthropic":
      return resolveAnthropicModel(model.id, clientKeys.anthropic);
    case "openai":
      return resolveOpenAIModel(model.id, clientKeys.openai);
    default:
      return assertUnsupportedProvider(provider);
  }
}

export function isSupportedChatModel(modelId: string): modelId is SupportedChatModelId {
  return findSupportedChatModel(modelId) != null;
}

export function resolveChatModel(modelId: string, clientKeys: ClientApiKeys = {}): ResolvedModel {
  const model = findSupportedChatModel(modelId);
  if (!model) {
    throw new Error(`Unsupported model: ${modelId}`);
  }
  return resolveSupportedChatModel(model, clientKeys);
}