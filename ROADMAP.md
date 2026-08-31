# CODEXA Development Roadmap

This document outlines the planned, in-progress, and future features of CODEXA. We welcome and encourage community contributions to these areas.

---

## 🚀 Near-Term Priorities (Next 1-2 Releases)

These are active focus areas or quick wins that are highly requested.

### 🔌 Plugin / Extension System for Custom Tools
- **Goal**: Enable external node/npm packages or local configuration scripts to register custom MCP-like tools or CLI plugins without rebuilding the core binaries.
- **Implementation**: Discover plugins listed in `~/.codexa/plugins.json`. Dynamically spawn or register their command-line bindings into the Hono server's tool runtime.
- **Help Needed**: Design plug-in discovery logic and standard hook interface formats.

### 🌐 Session Sharing & Replays (Opt-in)
- **Goal**: Enable developers to export or share sanitized transcript logs of their build sessions (for debugging, bug reporting, or code sharing).
- **Implementation**: Add an export button in the React web UI and CLI commands to output clean, anonymized JSON session transcripts.
- **Help Needed**: Build sanitization functions to automatically identify and strip API keys, database connection strings, credentials, and local path prefixes.

### 📶 Offline-First Resiliency & Response Caching
- **Goal**: Gracefully handle intermittent network drops by caching previous AI responses and schema queries.
- **Implementation**: Embed a local cache inside `~/.codexa/cache/` (using in-memory LRU or file caching) to store models, metadata, and tool responses.

---

## 🛠️ Mid-Term Priorities (3-6 Months)

These features require broader architectural changes and integration work.

### 🔍 Symbol-Aware CodexaLens (LSP Integration)
- **Goal**: Improve the depth and precision of CodexaLens indexing by consuming a Language Server Protocol (LSP) connection.
- **Benefits**: Richer symbol navigation, direct refactor awareness, and dependency links mapping.
- **Help Needed**: Create an LSP bridge/adapter inside `packages/shared` or the CLI runtime.

### 💸 Cost & Quota Controls (BUILD Mode Warnings)
- **Goal**: Prevent expensive accidental prompts/operations by warning users before running high-token actions.
- **Implementation**: Compare input/output tokens against a cost estimate cache before triggering a series of tool calls.
- **Help Needed**: Keep updated pricing tables for OpenAI/Anthropic models and calculate estimate parameters.

### ⚡ Incremental Indexing for CodexaLens
- **Goal**: Avoid full workspace re-indexing. Update the graph only for modified or created files.
- **Implementation**: Leverage file watch/event listening to index only changed symbols.

---

## 🗺️ Long-Term Vision (6+ Months)

Large-scale, strategic milestones for CODEXA.

### 🤝 Git / PR Integrations (BUILD Mode Auto-PRs)
- **Goal**: Allow BUILD mode to run in isolated git branches and automatically propose changes as draft pull requests on platforms like GitHub or GitLab.
- **Flow**: Spawn temporary branch → execute edits → verify code passes tests → commit changes → push branch → open draft PR with agent summaries.

---

## How to Contribute

If you'd like to claim any item on this roadmap:
1. Open or locate the corresponding GitHub issue.
2. Comment expressing interest so we can assign it to you and avoid duplicate work.
3. Review [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for details on setting up the workspace.
