import {
  type InferUITools,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import {
  modeSchema,
  type ModeType,
  type ToolContracts,
} from "@codexa/shared";
import { z } from "zod";
import { isSupportedChatModel } from "../lib/models";

type ChatMessageMetadata = {
  mode?: ModeType;
  model?: string;
  durationMs?: number;
  usage?: LanguageModelUsage;
};

export type CodexaUIMessage = UIMessage<
  ChatMessageMetadata,
  never,
  InferUITools<ToolContracts>
>;

export const submitSchema = z.object({
  id: z.string().min(1),
  messages: z
    .array(
      z.custom<CodexaUIMessage>((value) => {
        return (
          value !== null &&
          typeof value === "object" &&
          "id" in value &&
          "parts" in value &&
          Array.isArray(value.parts)
        );
      }),
    )
    .min(1),
  mode: modeSchema,
  model: z.string().refine(isSupportedChatModel, "Unsupported model"),
  projectContext: z.object({
    name: z.string().optional(),
    path: z.string().optional(),
    frameworks: z.array(z.string()).optional(),
    packageManager: z.string().optional(),
    languages: z.array(z.string()).optional(),
    testFramework: z.string().optional(),
    projectRules: z.string().optional(),
    fileCount: z.number().optional(),
  }).optional(),
});

export function hasPendingToolCalls(message: CodexaUIMessage) {
  return message.parts.some((part) => {
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
      const state = (part as { state?: string }).state;
      return state !== "output-available" && state !== "output-error";
    }
    return false;
  });
}
