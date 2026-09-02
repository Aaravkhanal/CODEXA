export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

export type SupportedProvider = "anthropic" | "openai" | "google" | "groq";

type SupportedChatModelDefinition = {
  id: string;
  provider: SupportedProvider;
  pricing: ModelPricing;
};

export const SUPPORTED_CHAT_MODELS = [
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15,
    },
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5,
    },
  },
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 5,
      outputUsdPerMillionTokens: 25,
    },
  },
  {
    id: "claude-3-5-sonnet",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15,
    },
  },
  {
    id: "claude-3-5-haiku",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5,
    },
  },
  {
    id: "gpt-5.4",
    provider: "openai",
    pricing: {
      inputUsdPerMillionTokens: 2.5,
      outputUsdPerMillionTokens: 15,
    },
  },
  {
    id: "gpt-5.4-mini",
    provider: "openai",
    pricing: {
      inputUsdPerMillionTokens: 0.75,
      outputUsdPerMillionTokens: 4.5,
    },
  },
  {
    id: "gpt-5.4-nano",
    provider: "openai",
    pricing: {
      inputUsdPerMillionTokens: 0.2,
      outputUsdPerMillionTokens: 1.25,
    },
  },
  {
    id: "gpt-4o",
    provider: "openai",
    pricing: {
      inputUsdPerMillionTokens: 2.5,
      outputUsdPerMillionTokens: 10,
    },
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    pricing: {
      inputUsdPerMillionTokens: 0.15,
      outputUsdPerMillionTokens: 0.6,
    },
  },
  {
    id: "gemini-2.5-pro",
    provider: "google",
    pricing: {
      inputUsdPerMillionTokens: 1.25,
      outputUsdPerMillionTokens: 5,
    },
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    pricing: {
      inputUsdPerMillionTokens: 0.075,
      outputUsdPerMillionTokens: 0.3,
    },
  },
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    pricing: {
      inputUsdPerMillionTokens: 0.59,
      outputUsdPerMillionTokens: 0.79,
    },
  },
] as const satisfies readonly SupportedChatModelDefinition[]

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string) {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "claude-opus-4-6";
export const DEFAULT_PLAN_CHAT_MODEL_ID: SupportedChatModelId = "claude-3-5-haiku";

export interface ModelRoutingOptions {
  enabled?: boolean;
  planModelId?: SupportedChatModelId | string;
  buildModelId?: SupportedChatModelId | string;
}

export interface RoutedModelResult {
  activeModelId: string;
  originalModelId: string;
  routed: boolean;
  savingsPercent: number;
  reason: string;
}

/** Calculate cost in USD for token usage under a specific model */
export function calculateModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = findSupportedChatModel(modelId);
  if (!model) return 0;
  return (
    (inputTokens * model.pricing.inputUsdPerMillionTokens +
      outputTokens * model.pricing.outputUsdPerMillionTokens) /
    1_000_000
  );
}

/** Calculate estimated savings between primary model and routed plan model */
export function calculateRoutingSavings(
  primaryModelId: string,
  planModelId: string,
  sampleInputTokens: number = 1000,
  sampleOutputTokens: number = 500,
): { primaryCost: number; planCost: number; savingsUsd: number; savingsPercent: number } {
  const primaryCost = calculateModelCost(primaryModelId, sampleInputTokens, sampleOutputTokens);
  const planCost = calculateModelCost(planModelId, sampleInputTokens, sampleOutputTokens);
  const savingsUsd = Math.max(0, primaryCost - planCost);
  const savingsPercent = primaryCost > 0 ? Math.round((savingsUsd / primaryCost) * 100) : 0;
  return { primaryCost, planCost, savingsUsd, savingsPercent };
}

/** Resolve active model based on session execution mode (PLAN vs BUILD) and routing configuration */
export function resolveCostAwareModel(
  mode: "plan" | "build",
  selectedModelId: string = DEFAULT_CHAT_MODEL_ID,
  options: ModelRoutingOptions = {},
): RoutedModelResult {
  const enabled = options.enabled ?? false;

  if (!enabled || mode !== "plan") {
    const activeModelId = (mode === "build" && options.buildModelId) ? options.buildModelId : selectedModelId;
    return {
      activeModelId,
      originalModelId: selectedModelId,
      routed: false,
      savingsPercent: 0,
      reason: enabled ? "BUILD mode uses primary implementation model" : "Model routing disabled",
    };
  }

  const planModelId = options.planModelId || DEFAULT_PLAN_CHAT_MODEL_ID;
  const { savingsPercent } = calculateRoutingSavings(selectedModelId, planModelId);

  return {
    activeModelId: planModelId,
    originalModelId: selectedModelId,
    routed: true,
    savingsPercent,
    reason: `PLAN mode routed to ${planModelId} (~${savingsPercent}% cost savings vs ${selectedModelId})`,
  };
}
