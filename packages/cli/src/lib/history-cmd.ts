import { ProjectMemoryManager, type SessionHistoryEntry } from "@codexa/agent";

export function formatSessionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function runHistoryCommand(cwd = process.cwd()): number {
  const sessions = new ProjectMemoryManager(cwd).listSessions();
  console.log("\nCODEXA Task History\n");
  if (sessions.length === 0) {
    console.log("  No saved tasks yet. Complete a task to create local history.\n");
    return 0;
  }

  for (const session of sessions) {
    const status = session.testsRun
      ? session.testsPassed
        ? "tests passed"
        : "tests failed"
      : "not tested";
    console.log(`  ${session.sessionId}  ${formatSessionTime(session.timestamp)}`);
    console.log(`    ${session.task}`);
    console.log(`    ${status} · ${session.filesModified.length} file(s) changed`);
  }
  console.log("\nResume with: codexa resume <session-id>\n");
  return 0;
}

export function createResumePrompt(session: SessionHistoryEntry): string {
  const files = session.filesModified.length > 0 ? session.filesModified.join(", ") : "none";
  return `Resume the previous CODEXA task safely.\n\nOriginal task: ${session.task}\nPrevious result: ${session.summary}\nFiles previously modified: ${files}\nTests: ${session.testsRun ? (session.testsPassed ? "passed" : "failed") : "not run"}\n\nInspect the current project state, continue any unfinished work, and do not repeat completed changes.`;
}

export function resolveResumePrompt(
  sessionId?: string,
  cwd = process.cwd(),
): { prompt?: string; error?: string } {
  const session = new ProjectMemoryManager(cwd).getSession(sessionId);
  if (!session) {
    return {
      error: sessionId
        ? `Saved task "${sessionId}" was not found. Run 'codexa history' to list task ids.`
        : "No saved tasks found. Complete a task before running 'codexa resume'.",
    };
  }
  return { prompt: createResumePrompt(session) };
}
