/**
 * One definition of "this failure is the backend being briefly unavailable,
 * not a real rejection". Used by both auth calls and post-login data reads so
 * a transient 5xx/PGRST002 never gets surfaced as an authentication failure.
 */
export type TransientCandidate = {
  message?: string;
  status?: number | null;
  code?: string | null;
} | null | undefined;

const TRANSIENT_CODES = new Set([
  "request_timeout",
  "unexpected_failure",
  // PostgREST: schema cache unavailable / cannot connect to the database
  "PGRST001",
  "PGRST002",
  "PGRST003",
  "57014", // statement timeout
  "08006", // connection failure
]);

export function isTransientBackendError(error: TransientCandidate): boolean {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  const name = ((error as { name?: string }).name || "").toLowerCase();
  const status = error.status ?? undefined;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  // A client-side abort (our own interactive timeout) and the SDK's retryable
  // fetch wrapper both surface as status 0 with no PostgREST code. Those are
  // transport failures, never a credential rejection.
  if (status === 0) return true;
  if (name === "aborterror" || name === "authretryablefetcherror" || name === "operationtimeouterror") return true;
  if (error.code && TRANSIENT_CODES.has(error.code)) return true;
  // A cold PostgREST answers with an empty body and no code before its schema
  // cache is warm; treat that as "not ready yet", not as a real rejection.
  if (!error.code && !error.message) return true;
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort") ||
    message.includes("upstream") ||
    message.includes("schema cache") ||
    message.includes("load failed") ||
    message.includes("connection")
  );
}


/** Bounded retry for transient backend failures. Real errors throw immediately. */
export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  { attempts = 3, baseDelayMs = 400 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientBackendError(error as TransientCandidate)) throw error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
      }
    }
  }
  throw lastError;
}
