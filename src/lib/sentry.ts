/**
 * Client-side Sentry wiring — the browser companion to
 * `src/server/sentry.ts` (same contract, `@sentry/react` SDK).
 *
 * The SPA shell used to let render errors vanish into the console: the
 * shared `ErrorBoundary` logged them and nothing initialized the Sentry
 * SDK in the browser even though `@sentry/*` packages were already in
 * the tree. This module is the single init + capture point for the
 * client, called once from the client shell entry (`NextClientShell`)
 * and from that boundary's `componentDidCatch`.
 *
 * Contract:
 * - The DSN comes from the `VITE_SENTRY_DSN` runtime env key only,
 *   resolved through `@/lib/runtime-env` — the app's single env
 *   contract, which aliases the Vite-era key to its
 *   `NEXT_PUBLIC_SENTRY_DSN` form. It is never hardcoded, and when the
 *   variable is unset the wiring is a strict no-op: the app boots and
 *   behaves exactly as before (local dev, tests, previews).
 * - Errors only: sampleRate 1.0 for errors, no performance tracing
 *   (tracesSampleRate 0), no session replay, `sendDefaultPii: false`.
 * - Capture NEVER throws and never carries request bodies or PII.
 *   Context is limited to the React component stack the boundary
 *   already receives.
 */
import * as Sentry from "@sentry/react";

import { getRuntimeEnvString } from "./runtime-env";

let initAttempted = false;
let sentryEnabled = false;

/**
 * Initialize the Sentry SDK once. Safe to call repeatedly and from any
 * boot path; returns whether Sentry is active after the call.
 */
export function initSentry(): boolean {
  if (initAttempted) return sentryEnabled;
  initAttempted = true;

  const dsn = getRuntimeEnvString("VITE_SENTRY_DSN")?.trim();
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
      environment: getRuntimeEnvString("SENTRY_ENVIRONMENT") ?? process.env.NODE_ENV,
    });
    sentryEnabled = true;
  } catch {
    // A telemetry failure must never take the app down with it.
    sentryEnabled = false;
  }
  return sentryEnabled;
}

export interface ClientErrorContext {
  /** The React component stack from the boundary's ErrorInfo, when any. */
  componentStack?: string;
}

/**
 * Report a client error to Sentry. Called by the shared `ErrorBoundary`
 * for errors it catches during render. No-op when `VITE_SENTRY_DSN` is
 * unset.
 */
export function captureClientError(error: unknown, context: ClientErrorContext = {}): void {
  try {
    if (!initSentry()) return;

    const exception =
      error instanceof Error
        ? error
        : new Error(
            typeof (error as { message?: unknown } | null)?.message === "string"
              ? ((error as { message: string }).message as string)
              : "Unknown client error",
          );

    Sentry.withScope((scope) => {
      if (context.componentStack) {
        scope.setContext("react", { componentStack: context.componentStack });
      }
      Sentry.captureException(exception);
    });
  } catch {
    // Telemetry must never break the boundary it observes.
  }
}
