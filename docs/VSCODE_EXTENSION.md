# VS Code Companion Extension (Scaffold)

The `@codexa/vscode` package provides a minimal VS Code companion extension scaffold that embeds the CODEXA terminal session inside VS Code's integrated terminal and renders a read-only CodexaLens sidebar view.

---

## Extension Architecture & Shipped Capabilities

### 1. Integrated Terminal Embedding (`codexa.launch`)
- **Command**: `CODEXA: Launch Terminal Session` (`codexa.launch`).
- **Behavior**: Spawns or focuses an integrated VS Code terminal (`CODEXA Terminal`) running the `codexa` CLI binary.
- **Integration Path**: Seamlessly bridges the terminal-native OpenTUI client into the editor layout.

### 2. CodexaLens Sidebar Webview (`codexaLensView`)
- **View Container**: Activity Bar `CODEXA` view.
- **Provider**: `CodexaLensViewProvider` (`WebviewViewProvider`).
- **Data Fetching**: Queries the CODEXA server API (`/codexalens/:sessionId` / `/health`) to display:
  - Graph nodes count & status
  - Timeline activity events & phase badges
  - Token consumption & estimated USD cost
  - Session status indicator (server vs. local CLI mode)

---

## Status: Scaffold vs. Complete

> [!NOTE]
> **Scaffolded/Partial**:
> - Integrated terminal launching (`codexa.launch`), command registrations, sidebar Webview rendering, and server API polling logic are **fully scaffolded and functional**.
> - Full interactive Graph visualizer canvas (D3/React rendering inside VS Code webview) and full AST file tree navigation are **future roadmap items**.

---

## Future Finishing Roadmap (Next Steps)

1. **Full Interactive Graph Canvas**: Embed the React CodexaLens Graph visualizer from `packages/web` into the VS Code webview pane via postMessage IPC.
2. **Direct Workspace Event Listening**: Wire `vscode.workspace.onDidChangeTextDocument` to push real-time file diff highlights into CodexaLens activity traces.
3. **Publisher Marketplace Packaging**: Add `.vsix` bundling via `vsce package` for publication on Visual Studio Marketplace.
