import { findSupportedChatModel, type ModeType, type SupportedChatModelId } from "@codexa/shared";

export type TaskModelRecommendation = {
  model: SupportedChatModelId;
  reason: string;
};

function totalPrice(model: SupportedChatModelId): number {
  const pricing = findSupportedChatModel(model)?.pricing;
  return (
    (pricing?.inputUsdPerMillionTokens ?? Infinity) +
    (pricing?.outputUsdPerMillionTokens ?? Infinity)
  );
}

/** Pick an available model conservatively; the caller retains final control. */
export function recommendTaskModel(
  task: string,
  mode: ModeType,
  availableModels: SupportedChatModelId[],
  selectedModel: SupportedChatModelId,
): TaskModelRecommendation {
  const usable = availableModels.length > 0 ? availableModels : [selectedModel];
  const selectedIsAvailable = usable.includes(selectedModel);
  const words = task.trim().split(/\s+/).filter(Boolean).length;
  const simple =
    words <= 16 &&
    /^(hi|hello|hey|thanks|thank you|explain|what is|who are you)\b/i.test(task.trim());
  const cheap = [...usable].sort((left, right) => totalPrice(left) - totalPrice(right))[0]!;

  if (mode === "PLAN") {
    return { model: cheap, reason: "Planning can use the lowest-cost configured model." };
  }
  if (simple) {
    return { model: cheap, reason: "This looks like a short, low-complexity request." };
  }
  if (selectedIsAvailable) {
    return { model: selectedModel, reason: "Using your selected model for implementation work." };
  }
  return {
    model: cheap,
    reason: "Your selected model has no configured key, so CODEXA chose an available model.",
  };
}
