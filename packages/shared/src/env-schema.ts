/**
 * Typed environment schema and validation for the CODEXA server.
 *
 * Import and call `validateEnv()` at server startup to catch misconfigured or
 * missing environment variables before the application starts handling requests.
 *
 * Only variables consumed by the server are declared here. CLI-only variables
 * (e.g. `API_URL`) are not validated by this module.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const url = z.string().url();
const nonEmptyString = z.string().min(1);
const optionalString = z.string().optional();
const percentFloat = z
  .string()
  .transform(Number)
  .pipe(z.number().min(0).max(1))
  .optional();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const serverEnvSchema = z.object({
  // ---- Database -----------------------------------------------------------
  /** Postgres connection string, e.g. postgresql://user:pass@host:5432/db */
  DATABASE_URL: url,

  // ---- Clerk auth ---------------------------------------------------------
  /** Clerk publishable key (pk_live_… or pk_test_…) */
  CLERK_PUBLISHABLE_KEY: nonEmptyString,
  /** Clerk secret key (sk_live_… or sk_test_…) */
  CLERK_SECRET_KEY: nonEmptyString,
  /** Clerk frontend API host, e.g. clerk.yourdomain.com */
  CLERK_FRONTEND_API: nonEmptyString,
  /** Clerk OAuth client ID for the CODEXA application */
  CLERK_OAUTH_CLIENT_ID: nonEmptyString,
  /** Clerk OAuth client secret (optional in some Clerk configurations) */
  CLERK_OAUTH_CLIENT_SECRET: optionalString,
  /** HS256 secret used to sign internal JWT tokens */
  JWT_SECRET: nonEmptyString,

  // ---- AI providers (at least one required) --------------------------------
  /** Anthropic API key for Claude models */
  ANTHROPIC_API_KEY: optionalString,
  /** OpenAI API key for GPT models */
  OPENAI_API_KEY: optionalString,

  // ---- Polar billing -------------------------------------------------------
  /** Polar access token for the billing integration */
  POLAR_ACCESS_TOKEN: nonEmptyString,
  /** Polar product ID linked to CODEXA subscriptions */
  POLAR_PRODUCT_ID: nonEmptyString,
  /** Polar credit meter ID used for usage tracking */
  POLAR_CREDITS_METER_ID: nonEmptyString,
  /**
   * Polar server environment: "sandbox" for development, "production" for live.
   * @default "sandbox"
   */
  POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),

  // ---- Observability (optional) -------------------------------------------
  /** Sentry DSN for error reporting. Leave empty to disable Sentry. */
  SENTRY_DSN: optionalString,
  /**
   * Sentry trace sampling rate between 0 and 1.
   * @default 0.1
   */
  SENTRY_TRACES_SAMPLE_RATE: percentFloat,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates `process.env` against the server env schema.
 *
 * Throws a descriptive `Error` listing every missing or invalid variable when
 * validation fails, so the process exits before accepting any traffic.
 *
 * At least one AI provider key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) must
 * be present for the server to be useful, but this check is performed as a
 * warning rather than a hard error to allow limited deployments.
 *
 * @returns The parsed and typed environment object.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `[CODEXA] Server startup failed — invalid environment configuration:\n\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the required values.\n`,
    );
  }

  const parsed = result.data;

  // Soft check: at least one AI provider must be configured.
  if (!parsed.ANTHROPIC_API_KEY && !parsed.OPENAI_API_KEY) {
    console.warn(
      "[CODEXA] Warning: neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set. " +
        "Chat endpoints will not function until at least one provider key is configured.",
    );
  }

  return parsed;
}
