import { useEffect, useMemo } from "react";
import { z } from "zod";
import { Mode, modeSchema } from "@codexa/shared";
import { useNavigate, useLocation } from "react-router";
import { SessionShell } from "../components/session-shell";
import { UserMessage } from "../components/messages";
import { useToast } from "../providers/toast";

const newSessionStateSchema = z.object({
  message: z.string(),
  mode: modeSchema,
  model: z.string(),
})

export function NewSession() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = useMemo(() => {
    const parsed = newSessionStateSchema.safeParse(location.state);
    return parsed.success ? parsed.data : null;
  }, [location.state]);

  // Guard: if naviagted here directly without state, go home
  useEffect(() => {
    if (!state) {
      navigate("/", { replace: true });
    }
  }, [state, navigate]);

  // Local sessions keep provider credentials and agent execution on this
  // machine. The hosted API is optional rather than a prerequisite to chat.
  useEffect(() => {
    if (!state) return;
    const session = {
      id: `local-${crypto.randomUUID()}`,
      title: state.message.slice(0, 100),
      cwd: process.cwd(),
      messages: [],
    };
    navigate(`/sessions/${session.id}`, {
      replace: true,
      state: { session, initialPrompt: state },
    });
  }, [state, navigate]);


  if (!state) return null;

  return (
    <SessionShell onSubmit={() => { }} inputDisabled loading>
      <UserMessage message={state.message} mode={state.mode}/>
    </SessionShell>
  );
}
