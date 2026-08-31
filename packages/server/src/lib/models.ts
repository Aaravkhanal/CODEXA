import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
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
type GoogleModelId = Extract<SupportedChatModel, { provider: "google" }>["id"];
type GroqModelId = Extract<SupportedChatModel, { provider: "groq" }>["id"];

export type ClientApiKeys = {
  anthropic?: string;
  openai?: string;
  google?: string;
  groq?: string;
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

function resolveGoogleModel(modelId: GoogleModelId, apiKey?: string): ResolvedModel {
  const google = createGoogle({
    apiKey: apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  });
  let sdkModelId: string = modelId;
  if (modelId === "gemini-2.5-pro") sdkModelId = "gemini-2.5-pro";
  else if (modelId === "gemini-2.5-flash") sdkModelId = "gemini-2.5-flash";
  return {
    model: google(sdkModelId),
    provider: "google",
    modelId,
  };
}

function resolveGroqModel(modelId: GroqModelId, apiKey?: string): ResolvedModel {
  const provider = createGroq({
    apiKey: apiKey ?? process.env.GROQ_API_KEY,
  });
  let sdkModelId: string = modelId;
  if (modelId === "llama-3.3-70b-versatile") sdkModelId = "llama-3.3-70b-versatile";
  return {
    model: provider(sdkModelId),
    provider: "groq",
    modelId,
  };
}

function resolveSupportedChatModel(model: SupportedChatModel, clientKeys: ClientApiKeys): ResolvedModel {
  const provider = model.provider;
  switch (provider) {
    case "anthropic":
      return resolveAnthropicModel(model.id, clientKeys.anthropic);
    case "openai":
      return resolveOpenAIModel(model.id, clientKeys.openai);
    case "google":
      return resolveGoogleModel(model.id as GoogleModelId, clientKeys.google);
    case "groq":
      return resolveGroqModel(model.id as GroqModelId, clientKeys.groq);
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