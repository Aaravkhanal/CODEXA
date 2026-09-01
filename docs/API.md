# CODEXA API Reference & Usage Guide

The **CODEXA Server** provides REST and SSE (Server-Sent Events) API endpoints for managing chat sessions, authenticating requests, querying CodexaLens codebase graphs, and triggering MCP tools.

---

## Interactive Swagger UI

When running the CODEXA development server (`bun run dev:server`), you can interactively explore and test all API routes in your browser:

- **Swagger UI**: [http://localhost:3000/swagger](http://localhost:3000/swagger)
- **OpenAPI 3.1 Spec (YAML)**: [http://localhost:3000/docs](http://localhost:3000/docs)

---

## Key API Endpoints

### 1. Authentication

- `GET /auth/config`: Retrieve public Clerk Frontend API credentials.
- `GET /auth/callback`: Process OAuth login redirects.

### 2. Chat Streaming (SSE)

- `POST /chat/stream`: Stream LLM responses and tool execution logs via Server-Sent Events.

```bash
curl -X POST http://localhost:3000/chat/stream \
  -H "Authorization: Bearer <clerk-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet",
    "mode": "PLAN",
    "messages": [
      { "role": "user", "content": "Explain the architecture of this repo." }
    ]
  }'
```

### 3. Session Management

- `GET /sessions`: List active and past coding sessions.
- `GET /sessions/:id`: Fetch chat history for a specific session.
- `DELETE /sessions/:id`: Delete a session.

### 4. CodexaLens Codebase Intelligence

- `POST /codexalens/graph`: Upload or query local project dependency graph nodes.
- `POST /codexalens/activity`: Track recent developer file edits and command execution events.
