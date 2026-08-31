import prettyMs from "pretty-ms";
import { EmptyBorder } from "../border";
import { TextAttributes } from "@opentui/core";
import { Mode, type ModeType, findSupportedChatModel } from "@codexa/shared";
import type { LanguageModelUsage } from "ai";
import type { Message } from "../../hooks/use-chat";
import { useTheme } from "../../providers/theme";
import { useMemo } from "react";

type ClientMessagePart = Message["parts"][number];
type ToolPart = Extract<ClientMessagePart, { type: `tool-${string}` | "dynamic-tool"}>;

type Props = {
  parts: ClientMessagePart[];
  model: string;
  mode: ModeType;
  durationMs?: number;
  streaming?: boolean; 
  usage?: LanguageModelUsage;
};

function formatToolName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function isToolPart(part: ClientMessagePart): part is ToolPart {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

function formatToolArgs(tc: ToolPart): string {
  if(!("input" in tc) || tc.input == null) return "";
  if(typeof tc.input !== "object") return String(tc.input);
  return Object.values(tc.input).map(String).join(" ");
}

type PartGroup = {
  type: ClientMessagePart["type"];
  parts: ClientMessagePart[];
  key: string;
};

function groupConsecutiveParts(parts: ClientMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.type === part.type) {
      lastGroup.parts.push(part);
    } else {
      const key =
        isToolPart(part) ? `group-tc-${part.toolCallId }` : `group-${part.type}-${i}`;
      groups.push({ type: part.type, parts: [part], key });
    }
  }

  return groups;
}

export function BotMessage({
  parts,
  model,
  mode,
  durationMs,
  streaming = false,
  usage,
}: Props) {
  const { colors } = useTheme();

  const cost = useMemo(() => {
    if (!usage) return null;
    const modelDef = findSupportedChatModel(model);
    if (!modelDef) return null;
    const inputCost = ((usage.inputTokens ?? 0) * modelDef.pricing.inputUsdPerMillionTokens) / 1_000_000;
    const outputCost = ((usage.outputTokens ?? 0) * modelDef.pricing.outputUsdPerMillionTokens) / 1_000_000;
    return inputCost + outputCost;
  }, [usage, model]);

  return (
    <box width="100%" alignItems="center">
      {groupConsecutiveParts(parts).map((group, i) => (
        <box key={group.key} width="100%" paddingTop={i === 0 ? 0 : 1}>
          {group.parts.map((part, j) => {
            if (part.type === "reasoning") {
              return (
                <box
                  key={`reasoning-${j}`}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <text attributes={TextAttributes.DIM}>
                    <em fg={colors.thinking}>Thinking:</em> {part.text}
                  </text>
                </box>
              );
            }

            if (isToolPart(part)) {
              const toolName =
                part.type === "dynamic-tool" ? part.toolName : part.type.slice("tool-".length);

              return (
                <box
                  key={part.toolCallId}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <box flexDirection="row" gap={1}>
                    <text attributes={TextAttributes.DIM} fg={colors.info}>{formatToolName(toolName)}:</text>
                    <text attributes={TextAttributes.DIM}>
                      {formatToolArgs(part)}
                      {part.state !== "output-available" && part.state !== "output-error"
                        ? "..."
                        : ""
                      }
                      {part.state === "output-error" ? ` ${part.errorText}` : ""}
                    </text>
                  </box>
                </box>
              );
            }

            if (part.type === "text") {
              return (
                <box key={`text-${j}`} paddingX={3} width="100%">
                  <text>{part.text}</text>
                </box>
              )
            }

            return null;
          })}
        </box>
      ))}

      <box paddingX={3} paddingY={1} gap={1} width="100%">
        <box flexDirection="row" gap={2}>
          <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>◉</text>
          <box flexDirection="row" gap={1}>
            <text>
              {mode === Mode.PLAN ? "Plan" : "Build"}
            </text>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              |
            </text>
            <text attributes={TextAttributes.DIM}>{model}</text>
            {usage && (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                  |
                </text>
                <text attributes={TextAttributes.DIM}>
                  {(usage.totalTokens ?? ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0))).toLocaleString()} tokens
                </text>
              </>
            )}
            {cost != null && (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                  |
                </text>
                <text attributes={TextAttributes.DIM}>
                  ~${cost.toFixed(4)}
                </text>
              </>
            )}
            {(durationMs != null) && (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                  |
                </text>
                <text attributes={TextAttributes.DIM}>
                  {prettyMs(durationMs)}
                </text>
              </>
            )}
          </box>
        </box>
      </box>
    </box>
  );
}
