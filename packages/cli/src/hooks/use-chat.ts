import { useMemo, useRef } from "react";
import { useChat as useAiChat } from "@ai-sdk/react";
import {
    DefaultChatTransport,
    type InferUITools,
    lastAssistantMessageIsCompleteWithToolCalls,
    type LanguageModelUsage,
    type UIMessage,
} from "ai";
import {
    type CodexaLensActivityEvent,
    type CodexaLensFileStatus,
    type ModeType,
    type SupportedChatModelId,
    type ToolContracts,
} from "@codexa/shared";
import { resolve } from "node:path";
import { getAllApiKeys } from "../lib/api-keys";
import { apiClient } from "../lib/api-client";
import { getAuth } from "../lib/auth";
import { executeLocalTool } from "../lib/local-tools";
import { useCodexaLens } from "../providers/codexalens";
import { detectProject } from "../lib/project-detector";
import { getProjectRules } from "../lib/project-rules";
import { getPermissionLevel } from "../lib/permission-manager";
import { saveFileSnapshot } from "../lib/snapshot-manager";

function activityEvent(
    toolCallId: string,
    toolName: string,
    input: unknown,
    phase: "started" | "completed",
    failed = false,
    sessionStartedAt = Date.now(),
    toolStartedAt?: number,
): CodexaLensActivityEvent {
    const timestampMs = Date.now();
    const args = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const filePaths = Object.entries(args)
        .filter(([key, value]) => /^(?:path|file|filePath)$/i.test(key) && typeof value === "string")
        .map(([, value]) => value as string);
    const status: CodexaLensFileStatus = failed
        ? "failed"
        : /(?:write|edit|create|delete|remove|update)/i.test(toolName)
          ? "modified"
          : "inspected";
    return {
        id: `${toolCallId}:${phase}`,
        toolCallId,
        toolName,
        phase,
        status,
        filePaths,
        timestampMs,
        offsetMs: Math.max(0, timestampMs - sessionStartedAt),
        ...(phase === "completed" && toolStartedAt
            ? { durationMs: Math.max(0, timestampMs - toolStartedAt) }
            : {}),
        summary: `${status[0]!.toUpperCase()}${status.slice(1)} ${filePaths[0] ?? toolName}`,
    };
}

export type ChatMessageMetadata = {
    mode?: ModeType;
    model?: SupportedChatModelId | string;
    durationMs?: number;
    usage?: LanguageModelUsage;
}

type ChatTools = {
    [Name in keyof InferUITools<ToolContracts>]: {
        input: InferUITools<ToolContracts>[Name]['input'],
        output: unknown;
    }
}

export type Message = UIMessage<ChatMessageMetadata, never, ChatTools>;

export function useChat(
    sessionId: string,
    initialMessages: Message[],
    options?: { askConfirmation?: (toolName: string, details: string) => Promise<boolean> }
) {
    const { recordActivity } = useCodexaLens();
    const sessionStartedAt = useRef(Date.now());
    const toolStartedAt = useRef(new Map<string, number>());
    const transport = useMemo(() => {
        return new DefaultChatTransport<Message>({
            api: apiClient.chat.$url().toString(),
            headers() {
                const auth = getAuth();
                const headers = new Headers();
                if (auth) {
                    headers.set("Authorization", `Bearer ${auth.token}`);
                }
                const storedKeys = getAllApiKeys();
                if (storedKeys.anthropic) {
                    headers.set("X-Anthropic-Key", storedKeys.anthropic);
                }
                if (storedKeys.openai) {
                    headers.set("X-OpenAI-Key", storedKeys.openai);
                }
                if (storedKeys.google) {
                    headers.set("X-Google-Key", storedKeys.google);
                }
                if (storedKeys.groq) {
                    headers.set("X-Groq-Key", storedKeys.groq);
                }
                return headers;
            },
            prepareSendMessagesRequest({ messages }) {
                const message = messages[messages.length - 1];
                if (!message) throw new Error("No messages to send");

                const metadata = messages.findLast(
                    (m) => m.metadata?.mode && m.metadata?.model
                )?.metadata;

                const rules = getProjectRules();
                const projInfo = detectProject();
                const projectContext = {
                    ...projInfo,
                    projectRules: rules,
                };

                return {
                    body: {
                        id: sessionId,
                        messages,
                        mode: message.metadata?.mode || metadata?.mode,
                        model: message.metadata?.model || metadata?.model,
                        projectContext,
                    },
                };
            }
        })
    }, [sessionId]);

    const chat = useAiChat<Message>({
        id: sessionId,
        messages: initialMessages,
        transport,
        onToolCall({ toolCall }) {
            const mode = chat.messages.at(-1)?.metadata?.mode ?? "BUILD";
            const permission = getPermissionLevel(toolCall.toolName, toolCall.input);
            
            const formatToolArgsString = (tc: any): string => {
                if (!tc.input) return "";
                if (typeof tc.input !== "object") return String(tc.input);
                return Object.entries(tc.input).map(([k, v]) => `${k}: ${v}`).join(", ");
            };

            const proceedPromise = permission === "dangerous" && options?.askConfirmation
                ? options.askConfirmation(toolCall.toolName, formatToolArgsString(toolCall))
                : Promise.resolve(true);

            proceedPromise.then((allowed) => {
                if (!allowed) {
                    throw new Error("Tool execution cancelled by user");
                }

                // Snapshots before modifying files
                if (["writeFile", "editFile", "deleteFile", "moveFile"].includes(toolCall.toolName)) {
                    const inputObj = toolCall.input as any;
                    const filePathsToSnapshot = [];
                    if (inputObj.path) filePathsToSnapshot.push(inputObj.path);
                    if (inputObj.from) filePathsToSnapshot.push(inputObj.from);

                    for (const relativePath of filePathsToSnapshot) {
                        try {
                            const absolutePath = resolve(process.cwd(), relativePath);
                            saveFileSnapshot(sessionId, relativePath, absolutePath);
                        } catch {
                            // ignore snapshot failures
                        }
                    }
                }

                const startedAt = Date.now();
                toolStartedAt.current.set(toolCall.toolCallId, startedAt);
                recordActivity(sessionId, activityEvent(
                    toolCall.toolCallId,
                    toolCall.toolName,
                    toolCall.input,
                    "started",
                    false,
                    sessionStartedAt.current,
                ));

                return executeLocalTool(toolCall.toolName, toolCall.input, mode);
            })
            .then((output) => {
                recordActivity(sessionId, activityEvent(
                    toolCall.toolCallId,
                    toolCall.toolName,
                    toolCall.input,
                    "completed",
                    false,
                    sessionStartedAt.current,
                    toolStartedAt.current.get(toolCall.toolCallId),
                ));
                toolStartedAt.current.delete(toolCall.toolCallId);
                return chat.addToolOutput({
                    tool: toolCall.toolName as keyof ChatTools,
                    toolCallId: toolCall.toolCallId,
                    output,
                });
            })
            .catch((error) => {
                recordActivity(sessionId, activityEvent(
                    toolCall.toolCallId,
                    toolCall.toolName,
                    toolCall.input,
                    "completed",
                    true,
                    sessionStartedAt.current,
                    toolStartedAt.current.get(toolCall.toolCallId),
                ));
                toolStartedAt.current.delete(toolCall.toolCallId);
                return chat.addToolOutput({
                    tool: toolCall.toolName as keyof ChatTools,
                    toolCallId: toolCall.toolCallId,
                    state: "output-error",
                    errorText: error instanceof Error ? error.message : String(error),
                });
            });
        },
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls
    });
    return {
        messages: chat.messages,
        status: chat.status,
        error: chat.error,
        submit: (params: { userText: string; mode: ModeType; model: SupportedChatModelId}) => {
            return chat.sendMessage({
                text: params.userText,
                metadata: {
                    mode: params.mode,
                    model: params.model,
                },
            })
        },
        abort: chat.stop,
        interrupt: chat.stop,
    };
}
