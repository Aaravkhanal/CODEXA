# CODEXA example projects

CODEXA can work in an existing repository; it does not require that repository
to use Bun, TypeScript, or a particular framework. Start it from the project
root so its tools remain scoped to that project:

```sh
cd path/to/your-project
codexa
```

## React / Vite

```sh
npm create vite@latest my-app -- --template react-ts
cd my-app
codexa
```

Try: `Plan a settings page with saved theme preferences, then implement it with tests.`

## Next.js

```sh
npx create-next-app@latest my-app
cd my-app
codexa
```

Try: `Inspect this repository and make a read-only plan for adding an authenticated dashboard.`

## Python service

```sh
mkdir my-service && cd my-service
uv init
codexa
```

Try: `Create a small FastAPI health endpoint, add tests, and show the verification command before making changes.`

## Useful first commands

- `/init` — create project guidance and let CODEXA learn the repository.
- `/plan` — request a read-only implementation plan.
- `/model` — change the model without leaving the current session.
- `/apikey` — add or replace provider credentials stored locally.
- `/usage` — inspect token usage for the current session.

Never paste credentials into a prompt, source file, or issue. Configure provider
keys through the setup wizard or `/apikey`.
