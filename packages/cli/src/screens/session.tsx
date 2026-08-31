import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { useKeyboard } from "@opentui/react";
import { type ModelPricing, type ModeType, type SupportedChatModelId } from "@codexa/shared";
import type { InferResponseType } from "hono/client";

import { SessionShell } from "../components/session-shell";
import {
  UserMessage,
  BotMessage,
  ErrorMessage,
} from "../components/messages";
import { apiClient } from "../lib/api-client";
import { useChat } from "../hooks/use-chat";
import { usePromptConfig } from "../providers/prompt-config";
import type { Message } from "../hooks/use-chat";
import { useToast } from "../providers/toast";
import { getErrorMessage } from "../lib/http-errors";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { useDialog } from "../providers/dialog";
import { CodexaLensDialogContent } from "../components/dialogs/codexalens-dialog";
import { AddApiKeyDialogContent } from "../components/dialogs/add-api-key-dialog";
import { ConfirmToolDialogContent } from "../components/dialogs";

type SessionData = InferResponseType<(typeof apiClient.sessions)[":id"]["$get"], 200>;

const initialPromptSchema = z.object({
  message: z.string(),
  mode: z.custom<ModeType>(),
  model: z.custom<SupportedChatModelId>(),
});

type InitialPrompt = z.infer<typeof initialPromptSchema>;

const sessionLocationSchema = z.object({
  session: z.custom<SessionData>((val) => val != null && typeof val === "object" && "messages" in val && Array.isArray((val as any).messages)),
  initialPrompt: initialPromptSchema.optional(),
});

function ChatMessage(
  { msg } : {
    msg: Message
  }
) {
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
  const [initialMessages] = useState(() => session.messages as unknown as Message[]);
  const { model, mode } = usePromptConfig();
  const { isTopLayer } = useKeyboardLayer();
  const dialog = useDialog();

  const askConfirmation = useCallback((toolName: string, details: string) => {
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
  }, [dialog]);

  const { messages, status, submit, abort, interrupt, error } = useChat(session.id, initialMessages, { askConfirmation });
  const hasSubmittedInitialPromptRef = useRef(false);

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
      onSubmit={(text) => {
        submit({ userText: text, mode, model });
      }}
      loading={status === "submitted" || status === "streaming"}
      interruptible={status === "submitted" || status === "streaming"}
    >
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
              <text fg="white">› API Key required for model {model}. Click here or run /models to configure key.</text>
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

  const [session, setSession] = useState<SessionData | null>(
    prefetched?.session ?? null
  );

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

  return <SessionChat key={session.id} session={session} initialPrompt={prefetched?.initialPrompt}/>;
}
