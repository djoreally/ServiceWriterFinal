/**
 * Post-sign-in return path (`?next=`).
 *
 * Used by the OAuth consent screen so an MCP client's authorization request
 * survives a sign-in round trip. Only same-origin relative paths are accepted.
 */
export function safeNextPath(search: string): string | null {
  const raw = new URLSearchParams(search).get("next");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}
