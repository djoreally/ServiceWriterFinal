/**
 * Server-side Sentry wiring (owner ruling, 2026-11-10).
 *
 * Production API errors used to vanish: the Hono server's error envelope
 * (`errorResponse` in `@/server/api`) logged the fallthrough to the console
 * and returned `internal_error`, and nothing anywhere initialized the
 * Sentry SDK even though `@sentry/*` packages were already in the tree.
 * This module is the single init + capture point for the server.
 *
 * Contract:
 * - The DSN comes from the `SENTRY_DSN` environment variable only. It is
 *   never hardcoded, and when the variable is unset the wiring is a strict
 *   no-op: the app boots and behaves exactly as before.
 * - Errors only: sampleRate 1.0 for errors, no performance tracing
 *   (tracesSampleRate 0), no session replay, `sendDefaultPii: false`.
 * - Capture NEVER throws and never carries request bodies or PII. Context
 *   is limited to the envelope's own error code, the HTTP status, the
 *   route, the method, and the workspace id — the same identifiers the
 *   server already writes to its logs.
 */
import * as Sentry from "@sentry/node";

let initAttempted = false;
let sentryEnabled = false;

/**
 * Initialize the Sentry SDK once. Safe to call repeatedly and from any
 * boot path; returns whether Sentry is active after the call.
 */
export function initSentry(): boolean {
  if (initAttempted) return sentryEnabled;
  initAttempted = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    sentryEnabled = false;
    return sentryEnabled;
  }

  try {
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      // Errors only — no performance tracing, no session replay.
      tracesSampleRate: 0,
      sampleRate: 1.0,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    });
    sentryEnabled = true;
  } catch {
    // A telemetry failure must never take the API down with it.
    sentryEnabled = false;
  }
  return sentryEnabled;
}

export interface ServerErrorContext {
  /** The error envelope's own code (e.g. "internal_error", "PGRST202"). */
  code?: string;
  /** The HTTP status the envelope is about to return. */
  status?: number;
  /** Request path (e.g. "/api/v1/appointments/123/start"). */
  route?: string;
  /** HTTP method. */
  method?: string;
  /** Workspace id, when the failing request carried one. */
  workspaceId?: string;
}

/**
 * Report a server error to Sentry. Called by `errorResponse` only for the
 * 5xx-class outcomes (the `internal_error` fallthrough, unmasked PostgREST
 * 5xx, and explicit 5xx statuses); deliberately mapped 4xx outcomes never
 * reach this function. No-op when `SENTRY_DSN` is unset.
 */
export function captureServerError(error: unknown, context: ServerErrorContext = {}): void {
  try {
    if (!initSentry()) return;

    const exception =
      error instanceof Error
        ? error
        : new Error(
            typeof (error as { message?: unknown } | null)?.message === "string"
              ? ((error as { message: string }).message as string)
              : "Unknown server error",
          );

    Sentry.withScope((scope) => {
      if (context.code) scope.setTag("error_code", context.code);
      if (context.status !== undefined) scope.setTag("http_status", String(context.status));
      if (context.route) scope.setTag("route", context.route);
      if (context.method) scope.setTag("method", context.method);
      if (context.workspaceId) scope.setContext("workspace", { id: context.workspaceId });
      Sentry.captureException(exception);
    });
  } catch {
    // Telemetry must never break the error envelope it observes.
  }
}
