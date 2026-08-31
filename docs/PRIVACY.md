# Privacy & Telemetry Policy

CODEXA is designed for developers who value security, privacy, and control over their codebase. We operate under a strict **local-first** security model.

---

## 1. Zero Default Telemetry

- **No Usage Tracking**: CODEXA does not capture, track, or phone home with usage stats, active sessions, command-line flags, or prompt history by default.
- **Local Context**: Your codebase index, directory trees, files scanned by CodexaLens, and shell logs never leave your system except when directly sent to your configured AI providers for inference.

---

## 2. Optional Sentry Error Logging (Opt-In)

If you host your own server instance or local environment, error monitoring is entirely optional and opt-in:
- **How to Opt In**: Populate the `SENTRY_DSN` environment variable in your `.env` configuration.
- **Data Collected**: When enabled, Sentry reports unhandled application crashes, stack traces, and internal HTTP exceptions (Hono).
- **No PII**: All default Personally Identifiable Information (PII) collection is disabled inside Sentry configuration (`sendDefaultPii: false` in `packages/server/src/index.ts`). Code snippets, prompts, database connection strings, and local file contents are never attached to error logs.

---

## 3. Third-Party AI Providers

When you use the AI chat or BUILD capabilities, your queries are processed by external language model providers:
- **Providers Supported**: Anthropic (Claude models) and OpenAI (GPT models).
- **Data Shared**: The relevant source file contents (requested via MCP tools or indexed by CodexaLens), prompt messages, and chat history.
- **Retention**: This transmission is governed by your own API agreements with the provider. Refer to:
  - [Anthropic Developer Privacy Policy](https://www.anthropic.com/legal/privacy)
  - [OpenAI Enterprise Privacy Policy](https://openai.com/enterprise-privacy)

---

## 4. Local Credential Storage

User credentials, Clerk OAuth sessions, and model API keys are kept strictly within user-owned directories:
- **File**: `~/.codexa/api-keys.json`
- **Permissions**: We recommend locking file access exclusively to the owner (`chmod 600`).
- **Sync**: CODEXA has no cloud sync for these keys. They remain locally cached on your hard drive.
