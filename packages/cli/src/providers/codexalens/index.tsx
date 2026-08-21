import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CodexaLensActivityEvent } from "@codexa/shared";

type CodexaLensContextValue = {
  recordActivity: (sessionId: string, event: CodexaLensActivityEvent) => void;
  getActivity: (sessionId: string) => CodexaLensActivityEvent[];
};

const CodexaLensContext = createContext<CodexaLensContextValue | null>(null);

export function CodexaLensProvider({ children }: { children: ReactNode }) {
  const [eventsBySession, setEventsBySession] = useState<
    Record<string, CodexaLensActivityEvent[]>
  >({});

  const recordActivity = useCallback(
    (sessionId: string, event: CodexaLensActivityEvent) => {
      setEventsBySession((current) => {
        const events = current[sessionId] ?? [];
        const existingIndex = events.findIndex((item) => item.id === event.id);
        const nextEvents = existingIndex === -1
          ? [...events, event]
          : events.map((item, index) => index === existingIndex ? event : item);

        return {
          ...current,
          [sessionId]: nextEvents.toSorted(
            (left, right) => left.timestampMs - right.timestampMs,
          ),
        };
      });
    },
    [],
  );

  const getActivity = useCallback(
    (sessionId: string) => eventsBySession[sessionId] ?? [],
    [eventsBySession],
  );

  const value = useMemo(
    () => ({ recordActivity, getActivity }),
    [recordActivity, getActivity],
  );

  return (
    <CodexaLensContext.Provider value={value}>
      {children}
    </CodexaLensContext.Provider>
  );
}

export function useCodexaLens() {
  const value = useContext(CodexaLensContext);
  if (!value) {
    throw new Error("useCodexaLens must be used within a CodexaLensProvider");
  }
  return value;
}
