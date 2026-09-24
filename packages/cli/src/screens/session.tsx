import type { SafeEditPreview } from "@codexa/agent";
import { type ModeType, SUPPORTED_CHAT_MODELS, type SupportedChatModelId } from "@codexa/shared";
import { useKeyboard } from "@opentui/react";
import type { InferResponseType } from "hono/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { z } from "zod";
import { ConfirmPlanDialogContent, ConfirmToolDialogContent } from "../components/dialogs";
import { AddApiKeyDialogContent } from "../components/dialogs/add-api-key-dialog";
import { CodexaLensDialogContent } from "../components/dialogs/codexalens-dialog";
import { ModelsDialogContent } from "../components/dialogs/models-dialog";
import { BotMessage, ErrorMessage, UserMessage } from "../components/messages";
import { SessionShell } from "../components/session-shell";
import type { Message } from "../hooks/use-chat";
import { useLocalAgentChat } from "../hooks/use-local-agent-chat";
import { apiClient } from "../lib/api-client";
import { hasApiKey } from "../lib/api-keys";
import { getErrorMessage } from "../lib/http-errors";
import { getProviderForModel } from "../lib/model-utils";
import { recommendTaskModel } from "../lib/task-model-router";
import { useDialog } from "../providers/dialog";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { usePromptConfig } from "../providers/prompt-config";
import { useToast } from "../providers/toast";

type SessionData = InferResponseType<(typeof apiClient.sessions)[":id"]["$get"], 200>;

const initialPromptSchema = z.object({
  message: z.string(),
  mode: z.custom<ModeType>(),
  model: z.custom<SupportedChatModelId>(),
});

type InitialPrompt = z.infer<typeof initialPromptSchema>;

const sessionLocationSchema = z.object({
  session: z.custom<SessionData>(
    (val) =>
      val != null &&
      typeof val === "object" &&
      "messages" in val &&
      Array.isArray((val as any).messages),
  ),
  initialPrompt: initialPromptSchema.optional(),
});

function ChatMessage({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    const text = msg.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");

    return <UserMessage message={text} mode={msg.metadata?.mode ?? "BUILD"} />;
  }

  return (
    <box>
      <BotMessage
        parts={msg.parts}
        model={msg.metadata?.model ?? "unknown"}
        mode={msg.metadata?.mode ?? "BUILD"}
        durationMs={msg.metadata?.durationMs}
        streaming={false}
        usage={msg.metadata?.usage}
      />
    </box>
  );
}

function SessionChat({
  session,
  initialPrompt,
}: {
  session: SessionData;
  initialPrompt?: InitialPrompt;
}) {
  const { model, mode, setModel } = usePromptConfig();
  const navigate = useNavigate();
  const { isTopLayer } = useKeyboardLayer();
  const dialog = useDialog();

  const askConfirmation = useCallback(
    (toolName: string, details: string) => {
      return new Promise<boolean>((resolve) => {
        dialog.open({
          title: "Confirm Tool Execution",
          children: (
            <ConfirmToolDialogContent
              toolName={toolName}
              details={details}
              onConfirm={(allowed) => {
                resolve(allowed);
              }}
            />
          ),
        });
      });
    },
    [dialog],
  );

  const approvePlan = useCallback(
    (preview: SafeEditPreview) => {
      return new Promise<boolean>((resolve) => {
        dialog.open({
          title: "Safe edit preview",
          size: "fullscreen",
          children: <ConfirmPlanDialogContent preview={preview} onConfirm={resolve} />,
        });
      });
    },
    [dialog],
  );

  const { messages, status, submit, abort, interrupt, error, progress, plan, clear } =
    useLocalAgentChat({ askConfirmation, approvePlan });
  const hasSubmittedInitialPromptRef = useRef(false);

  const submitWithRouting = useCallback(
    (text: string) => {
      const availableModels = SUPPORTED_CHAT_MODELS.filter((candidate) =>
        hasApiKey(getProviderForModel(candidate.id)),
      ).map((candidate) => candidate.id);
      const recommendation = recommendTaskModel(text, mode, availableModels, model);
      const providerCount = new Set(availableModels.map(getProviderForModel)).size;
      const start = (selectedModel: SupportedChatModelId) => {
        setModel(selectedModel);
        void submit({ userText: text, mode, model: selectedModel });
      };

      if (providerCount > 1) {
        dialog.open({
          title: `Choose model — recommended: ${recommendation.model}`,
          children: <ModelsDialogContent models={availableModels} onSelectModel={start} />,
        });
        return;
      }
      start(recommendation.model);
    },
    [dialog, mode, model, setModel, submit],
  );

  // Stop the pending reply when the user leaves this session.
  useEffect(() => {
    return () => void abort();
  }, [abort]);

  // Let the user cancel a reply even before the first streamed chunk arrives.
  useKeyboard((key) => {
    if (key.name === "l" && key.ctrl && isTopLayer("base")) {
      key.preventDefault();
      dialog.open({
        title: "CodexaLens",
        size: "fullscreen",
        children: <CodexaLensDialogContent sessionId={session.id} />,
      });
      return;
    }
    if (key.name === "escape" && isTopLayer("base") && status === "streaming") {
      key.preventDefault();
      interrupt();
    }
  });

  useEffect(() => {
    if (!initialPrompt || hasSubmittedInitialPromptRef.current) return;

    hasSubmittedInitialPromptRef.current = true;

    void submit({
      userText: initialPrompt.message,
      mode: initialPrompt.mode,
      model: initialPrompt.model,
    });
  }, [initialPrompt, submit]);

  return (
    <SessionShell
      onSubmit={submitWithRouting}
      loading={status === "streaming"}
      interruptible={status === "streaming"}
      onClear={clear}
    >
      <box flexDirection="row" gap={2} marginBottom={1}>
        <box paddingX={1} backgroundColor="gray" onMouseDown={() => navigate("/")}>
          <text fg="black">← Home / New task</text>
        </box>
        <box
          paddingX={1}
          backgroundColor="cyan"
          onMouseDown={() => {
            dialog.open({
              title: "Switch model for the next task",
              children: (
                <ModelsDialogContent
                  models={SUPPORTED_CHAT_MODELS.map((candidate) => candidate.id)}
                  onSelectModel={setModel}
                />
              ),
            });
          }}
        >
          <text fg="black">Model: {model} (/model)</text>
        </box>
        {messages.length > 0 && (
          <box paddingX={1} backgroundColor="gray" onMouseDown={clear}>
            <text fg="black">Clear chat (/clear)</text>
          </box>
        )}
      </box>
      {status === "streaming" && progress && (
        <box
          flexDirection="column"
          borderStyle="single"
          borderColor="cyan"
          paddingX={1}
          paddingY={1}
          marginBottom={1}
        >
          <text fg="cyan">
            {progress.phase.toUpperCase()} · {progress.message}
          </text>
          {progress.filesModified && progress.filesModified.length > 0 && (
            <text fg="gray">Files: {progress.filesModified.join(", ")}</text>
          )}
        </box>
      )}
      {status === "streaming" && plan && (
        <box
          flexDirection="column"
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
          paddingY={1}
          marginBottom={1}
        >
          <text fg="yellow">Proposed plan — approval is required before edits</text>
          <text>{plan}</text>
        </box>
      )}
      {messages.map((msg) => (
        <ChatMessage key={msg.id} msg={msg} />
      ))}
      {error && (
        <box flexDirection="column" gap={1}>
          <ErrorMessage message={error.message} />
          {/api-key|api_key|unauthorized|401/i.test(error.message) && (
            <box
              flexDirection="row"
              gap={1}
              paddingX={1}
              backgroundColor="red"
              onMouseDown={() => {
                dialog.open({
                  title: `Setup API Key for ${model}`,
                  children: <AddApiKeyDialogContent initialModelId={model} />,
                });
              }}
            >
              <text fg="white">
                › API Key required for model {model}. Click here or run /models to configure key.
              </text>
            </box>
          )}
        </box>
      )}
    </SessionShell>
  );
}

export function Session() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const prefetched = useMemo(() => {
    const parsed = sessionLocationSchema.safeParse(location.state);
    return parsed.success ? parsed.data : null;
  }, [location.state]);

  const [session, setSession] = useState<SessionData | null>(prefetched?.session ?? null);

  useEffect(() => {
    // Skip fetch if session was passed via location state
    if (prefetched?.session) return;

    setSession(null);

    if (!id) return;

    let ignore = false;
    const fetchSession = async () => {
      try {
        const res = await apiClient.sessions[":id"].$get({
          param: { id },
        });
        if (ignore) return;
        if (!res.ok) throw new Error(await getErrorMessage(res));
        const resolved = await res.json();
        setSession(resolved);
      } catch (err) {
        if (ignore) return;
        toast.show({
          variant: "error",
          message: err instanceof Error ? err.message : "Failed to load session",
        });
        navigate("/", { replace: true });
      }
    };
    fetchSession();
    return () => {
      ignore = true;
    };
  }, [id, toast, navigate, prefetched]);

  if (!session) {
    return <SessionShell onSubmit={() => {}} inputDisabled loading />;
  }

  return (
    <SessionChat key={session.id} session={session} initialPrompt={prefetched?.initialPrompt} />
  );
}
