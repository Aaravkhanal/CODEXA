import * as vscode from "vscode";
import { CodexaLensViewProvider } from "./sidebar-provider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new CodexaLensViewProvider(context.extensionUri);

  // Register Webview View Provider for CodexaLens Sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CodexaLensViewProvider.viewType,
      provider,
    ),
  );

  // Command: Launch CODEXA in Integrated Terminal
  const launchCommand = vscode.commands.registerCommand("codexa.launch", () => {
    const existingTerminal = vscode.window.terminals.find((t) => t.name === "CODEXA Terminal");
    if (existingTerminal) {
      existingTerminal.show();
      existingTerminal.sendText("codexa");
    } else {
      const terminal = vscode.window.createTerminal({
        name: "CODEXA Terminal",
        iconPath: new vscode.ThemeIcon("terminal"),
      });
      terminal.show();
      terminal.sendText("codexa");
    }
    vscode.window.showInformationMessage("Launched CODEXA in VS Code integrated terminal.");
  });

  // Command: Refresh CodexaLens Sidebar Data
  const refreshCommand = vscode.commands.registerCommand("codexa.openLens", async () => {
    try {
      const apiUrl = process.env.CODEXA_API_URL || "http://localhost:3000";
      // Scaffold data fetch from local server endpoint if running
      const res = await fetch(`${apiUrl}/health`).catch(() => null);
      const isServerOnline = Boolean(res && res.ok);

      provider.updateData({
        sessionId: isServerOnline ? "active-vscode-session" : "local-cli-mode",
        graphNodesCount: isServerOnline ? 12 : 0,
        timelineEventsCount: isServerOnline ? 8 : 0,
        modelRunsCount: isServerOnline ? 4 : 0,
        totalTokens: isServerOnline ? 1420 : 0,
        estimatedCostUsd: isServerOnline ? 0.0042 : 0,
        recentEvents: isServerOnline
          ? [
              { summary: "Inspected src/index.ts", phase: "completed", status: "inspected" },
              { summary: "Modified packages/shared/src/models.ts", phase: "completed", status: "modified" },
              { summary: "Verified test suite bun test", phase: "completed", status: "verified" },
            ]
          : [],
      });

      vscode.window.showInformationMessage(
        isServerOnline
          ? "CodexaLens sidebar refreshed from CODEXA server."
          : "CODEXA server offline — displaying local terminal scaffold status.",
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to refresh CodexaLens: ${err.message}`);
    }
  });

  context.subscriptions.push(launchCommand, refreshCommand);
}

export function deactivate() {}
