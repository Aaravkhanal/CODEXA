import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupportedProvider, SupportedChatModelId, ModelRoutingOptions, RoutedModelResult } from "@codexa/shared";
import { SUPPORTED_CHAT_MODELS, resolveCostAwareModel } from "@codexa/shared";

/**
 * Resolves the provider name for a given model ID.
 * Falls back to "openai" for unknown models.
 */
export function getProviderForModel(modelId: SupportedChatModelId | string): SupportedProvider {
  const found = SUPPORTED_CHAT_MODELS.find((m) => m.id === modelId);
  return found?.provider ?? "openai";
}

/**
 * Load routing configuration from .codexa/config.json or environment variables
 */
export function resolveProjectRoutingConfig(cwd: string = process.cwd()): ModelRoutingOptions {
  let enabled = process.env.CODEXA_ROUTING_ENABLED === "true";
  let planModelId = process.env.CODEXA_PLAN_MODEL || undefined;
  let buildModelId = process.env.CODEXA_BUILD_MODEL || undefined;

  const configPath = join(cwd, ".codexa", "config.json");
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
      if (cfg.routing && typeof cfg.routing === "object") {
        if (typeof cfg.routing.enabled === "boolean") {
          enabled = cfg.routing.enabled;
        }
        if (typeof cfg.routing.planModel === "string") {
          planModelId = cfg.routing.planModel;
        }
        if (typeof cfg.routing.buildModel === "string") {
          buildModelId = cfg.routing.buildModel;
        }
      }
    } catch {
      // Ignore malformed config
    }
  }

  return { enabled, planModelId, buildModelId };
}

/**
 * Resolves the model to use for a given session step (PLAN vs BUILD mode),
 * taking into account cost-aware routing settings.
 */
export function resolveModelForSession(
  mode: "plan" | "build",
  selectedModelId: string,
  cwd: string = process.cwd(),
  overrideRouting?: ModelRoutingOptions,
): RoutedModelResult {
  const projectRouting = resolveProjectRoutingConfig(cwd);
  const options: ModelRoutingOptions = {
    ...projectRouting,
    ...overrideRouting,
  };

  return resolveCostAwareModel(mode, selectedModelId, options);
}
