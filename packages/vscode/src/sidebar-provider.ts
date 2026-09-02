import type * as vscode from "vscode";

export interface CodexaLensSidebarData {
  sessionId?: string;
  cwd?: string;
  graphNodesCount: number;
  timelineEventsCount: number;
  modelRunsCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
  recentEvents: Array<{ summary: string; phase: string; status: string }>;
}

export class CodexaLensViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codexaLensView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, {
      graphNodesCount: 0,
      timelineEventsCount: 0,
      modelRunsCount: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      recentEvents: [],
    });
  }

  public updateData(data: CodexaLensSidebarData) {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview, data);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, data: CodexaLensSidebarData) {
    const eventsHtml = data.recentEvents.length > 0
      ? data.recentEvents
          .map(
            (e) =>
              `<div class="event-item ${e.status}"><span class="badge ${e.phase}">${e.phase}</span> ${escapeHtml(
                e.summary,
              )}</div>`,
          )
          .join("")
      : `<div class="empty">No active session trace yet. Launch CODEXA to start tracking.</div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodexaLens</title>
  <style>
    body {
      font-family: var(--vscode-font-family, monospace);
      padding: 12px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
    }
    h3 {
      margin-top: 0;
      color: var(--vscode-charts-blue);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #333);
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .metric-value {
      font-weight: bold;
      color: var(--vscode-charts-green);
    }
    .event-item {
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
      font-size: 11px;
    }
    .badge {
      display: inline-block;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 9px;
      text-transform: uppercase;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .empty {
      font-size: 11px;
      color: var(--vscode-disabledForeground);
      font-style: italic;
    }
    button {
      width: 100%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 8px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <h3>CodexaLens Sidebar</h3>
  <div class="metric-card">
    <div class="metric-row"><span>Session:</span> <span>${data.sessionId || "Offline / Direct"}</span></div>
    <div class="metric-row"><span>Graph Nodes:</span> <span class="metric-value">${data.graphNodesCount}</span></div>
    <div class="metric-row"><span>Timeline Events:</span> <span class="metric-value">${data.timelineEventsCount}</span></div>
    <div class="metric-row"><span>Tokens Consumed:</span> <span class="metric-value">${data.totalTokens}</span></div>
    <div class="metric-row"><span>Est. Spend:</span> <span class="metric-value">$${data.estimatedCostUsd.toFixed(4)}</span></div>
  </div>

  <h3>Activity Timeline</h3>
  <div id="events-list">
    ${eventsHtml}
  </div>
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#039;";
      default: return m;
    }
  });
}
