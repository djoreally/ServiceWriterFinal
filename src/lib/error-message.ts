/**
 * Readable message for anything thrown by the backend.
 *
 * Supabase/PostgREST rejects with a plain object (`{ message, details, hint, code }`),
 * not an `Error`. Interpolating that object into a string produced the
 * "[object Object]" the Reports screen was showing, hiding the real fault.
 */
export function errorMessage(error: unknown, fallback = "Unexpected error"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || fallback;

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
    const code = typeof record.code === "string" && record.code ? ` (${record.code})` : "";
    if (parts.length > 0) return `${parts.join(" — ")}${code}`;
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      /* fall through to fallback */
    }
  }

  return fallback;
}
