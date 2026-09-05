<p align="center">
  <img src="./packages/web/public/demo.gif" alt="CODEXA - open-source terminal coding agent" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/Aaravkhanal/CODEXA/actions/workflows/ci.yml"><img src="https://github.com/Aaravkhanal/CODEXA/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="https://github.com/Aaravkhanal/CODEXA/releases"><img src="https://img.shields.io/github/v/release/Aaravkhanal/CODEXA" alt="Releases" /></a>
  <a href="https://github.com/Aaravkhanal/CODEXA/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-brightgreen.svg" alt="License: MIT" /></a>
  <a href="https://github.com/Aaravkhanal/CODEXA/actions/workflows/codeql-analysis.yml"><img src="https://github.com/Aaravkhanal/CODEXA/actions/workflows/codeql-analysis.yml/badge.svg" alt="CodeQL" /></a>
  <a href="https://codecov.io/gh/Aaravkhanal/CODEXA"><img src="https://img.shields.io/codecov/c/github/Aaravkhanal/CODEXA" alt="Coverage" /></a>
</p>

<p align="center">
  <a href="https://github.com/Aaravkhanal/CODEXA/releases">Releases</a>
  ·
  <a href="./docs/RELEASING.md">Release Guide</a>
  ·
  <a href="./CONTRIBUTING.md">Contributing</a>
  ·
  <a href="./docs/DEVELOPMENT.md">Development</a>
  ·
  <a href="./SUPPORT.md">Support</a>
  ·
  <a href="./packages/web">Landing Page</a>
</p>

# CODEXA — Universal AI Coding Agent

> **CODEXA** is an installable, high-performance, terminal-native AI coding agent built with Bun, TypeScript, and OpenTUI. It runs directly inside your terminal in any directory, powered by multi-agent orchestration and local or cloud AI providers.

---

## ⚡ Quick Start

### Install via npm

```bash
npm install -g codexa
```

Then use it in any project directory:

```bash
cd my-project
codexa
```

### Install from Source (GitHub)

```bash
git clone https://github.com/Aaravkhanal/CODEXA.git
cd CODEXA
bun install
npm link
```

Then run anywhere:

```bash
cd ~/any-project
codexa
```

---

## 🧙 First-Run Interactive Setup Wizard

When you run `codexa` for the first time without configuration, CODEXA automatically launches an interactive terminal setup wizard:

```text
╭────────────────────────────────────────────╮
│                   CODEXA                   │
│         AI Software Engineering Agent      │
╰────────────────────────────────────────────╯

Select your AI provider:
  ❯ 1. Anthropic (Claude Opus, Sonnet, Haiku)
    2. OpenAI (GPT-5.4, GPT-4o, GPT-4o-mini)
    3. Google (Gemini 2.5 Pro, Flash)
    4. Groq (Llama 3.3 70B, Mixtral)
    5. Ollama (Local, offline, no API key required)
    6. OpenRouter (Access 100+ models via one key)
    7. Custom / OpenAI-compatible API
```

1. **Select your AI provider** (Anthropic, OpenAI, Google, Groq, Ollama, OpenRouter, or Custom API).
2. **Enter your API key** (masked securely, never logged).
3. **Select or enter your model** (auto-detects local models when using Ollama!).
4. **Connection test**: CODEXA verifies your provider setup with a live test query.
5. **Saved to `~/.codexa/`**: Credentials and settings are stored locally with `0600` permissions.

---

## 🛠️ Key Features

- **🌐 Pluggable Provider Architecture**: Choose between Anthropic, OpenAI, Google Gemini, Groq, local Ollama (100% offline), OpenRouter, or custom OpenAI-compatible endpoints.
- **🤖 Multi-Agent Orchestration**: Specialized sub-agent pipeline (Explorer → Planner → Coder → Tester → Debugger → Reviewer) to handle complex software tasks end-to-end.
- **⚡ Local-First Execution**: Runs tools directly on your machine without requiring external cloud backend servers or active subscriptions.
- **⚙️ Profile Management**: Switch profiles on the fly (`codexa --profile cheap`, `codexa --profile local`).
- **📁 Project Instructions (`codexa init`)**: Create `.codexa/instructions.md` and `.codexa/architecture.md` in any repo to teach CODEXA project conventions.
- **🔒 Hardened Opt-in Docker Sandbox**: Run BUILD-mode shell execution safely (`--sandbox` / `CODEXA_SANDBOX=true`).
- **🔍 CodexaLens Code Intelligence**: Built-in AST dependency graph, local TF-IDF code search, active context timeline recorder, and token/credit usage tracking.

---

## 📑 Command Reference

| Command | Purpose |
| --- | --- |
| `codexa` | Launch interactive TUI agent session |
| `codexa "<prompt>"` | Execute a single task prompt directly |
| `codexa plan "<prompt>"` | Create step-by-step implementation plan (PLAN mode) |
| `codexa config` | Launch interactive configuration manager |
| `codexa config provider` | Quick switch AI provider |
| `codexa config model` | Quick switch AI model |
| `codexa config reset` | Reset all global configuration |
| `codexa init` | Initialize `.codexa/` instructions & architecture in current project |
| `codexa doctor` | Run diagnostic checks on system, keys, and MCP tools |
| `codexa status` | Output project language/framework detection status |
| `codexa review` | Review uncommitted git changes for potential bugs |
| `codexa commit` | Stage changes and generate a structured git commit message |

---

## 🔒 Security & Privacy

- **API Keys**: Stored locally in `~/.codexa/credentials.json` with strict `0600` POSIX permissions. Never transmitted to third-party telemetry.
- **Local AI (Ollama)**: Use `Ollama` for 100% offline development where no code or prompt leaves your computer.
- **Fail-Closed Permission Rules**: Commands and file writes require explicit confirmation unless `--auto-approve` / `-y` is set.
- **Docker Sandbox**: Optional network-isolated container execution for safe bash commands (`--sandbox`).

---

## 🏗️ Repository Architecture

| Path | Description |
| --- | --- |
| `packages/agent` | Core agent engine, multi-provider abstraction, context budgeting, sub-agents |
| `packages/cli` | Terminal UI (OpenTUI), setup wizard, config manager, local tool executor |
| `packages/shared` | Shared schemas, models metadata, local TF-IDF indexer, MCP contracts |
| `packages/server` | Cloud Hono API server for hosted deployment |
| `packages/web` | Landing page web application |

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## 📄 License

CODEXA is released under the [MIT License](./LICENSE).
