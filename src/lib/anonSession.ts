/**
 * Anonymous visitor session — persistent cookie + localStorage fallback.
 *
 * Used by the public booking funnel to track every step a visitor takes
 * (cart-abandonment style), even before they enter an email. The id is
 * a random UUID stored for 1 year. If cookies are blocked we fall back
 * to localStorage so the visitor still has a stable identity within the
 * browser session.
 */

const COOKIE_NAME = "lvbl_bk_sid";
const STORAGE_KEY = "lvbl_bk_sid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

/** Generate (and persist) a stable anonymous session id for this browser. */
export function getAnonSessionId(): string {
  if (typeof window === "undefined") {
    // SSR / tests — return ephemeral
    return crypto.randomUUID();
  }
  let id = readCookie(COOKIE_NAME);
  if (!id) {
    try {
      id = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      id = null;
    }
  }
  if (!id) {
    id = crypto.randomUUID();
  }
  // Refresh on every read to keep the cookie sliding-expiring
  writeCookie(COOKIE_NAME, id, ONE_YEAR_SECONDS);
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}
