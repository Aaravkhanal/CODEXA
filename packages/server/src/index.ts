import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "./middleware/require-auth";
import * as Sentry from "@sentry/hono/bun";
import { sentry } from "@sentry/hono/bun";
import sessions from "./routes/sessions";
import chat from "./routes/chat";
import mcp from "./routes/mcp";
import auth from "./routes/auth";
import codexalens from "./routes/codexalens";
import billing from "./routes/billing";
import { validateEnv } from "@codexa/shared";

// Validate environment variables before any app logic runs.
// This throws with a human-readable message on misconfiguration.
validateEnv();

const app = new Hono();


const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  const configuredSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1");
  const tracesSampleRate = Number.isFinite(configuredSampleRate)
    ? Math.min(1, Math.max(0, configuredSampleRate))
    : 0.1;

  app.use(
    sentry(app, {
      dsn: sentryDsn,
      tracesSampleRate,
      enableLogs: true,
      sendDefaultPii: false,
    }),
  );
}


app.onError((error, c) => {
  if (error instanceof HTTPException) {
    Sentry.logger.warn("Handled HTTP error", {
      status: error.status,
      message: error.message || "Request failed",
      path: c.req.path,
      method: c.req.method,
    });

    return c.json({
      error: error.message || "Request failed",
    }, error.status);
  }

  console.error("Unhandled server error", error);
  return c.json({
    error: "Internal Server Error"
  }, 500);
});

app.use("/sessions/*", requireAuth);
app.use("/chat/*", requireAuth);
app.use("/mcp/*", requireAuth);
app.use("/codexalens/*", requireAuth);
app.use("/billing/checkout", requireAuth);
app.use("/billing/portal", requireAuth);

const routes = app
  .route("/auth", auth)
  .route("/sessions", sessions)
  .route("/chat", chat)
  .route("/mcp", mcp)
  .route("/codexalens", codexalens)
  .route("/billing", billing);

// Dev-only endpoint to serve OpenAPI YAML documentation
if (process.env.NODE_ENV !== "production") {
  app.get("/docs", async (c) => {
    try {
      const specPath = import.meta.dir + "/../docs/openapi.yaml";
      const file = Bun.file(specPath);
      if (!(await file.exists())) {
        return c.text("OpenAPI documentation not found", 404);
      }
      c.header("Content-Type", "text/yaml");
      return c.body(await file.text());
    } catch (error) {
      return c.text("Failed to load OpenAPI spec", 500);
    }
  });
}

export type AppType = typeof routes;

// idleTimeout must be high otherwise LLM tool calls might not complete
export default { port: 3000, fetch: app.fetch, idleTimeout: 255 };

