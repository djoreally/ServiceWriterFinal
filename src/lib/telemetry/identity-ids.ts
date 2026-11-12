/**
 * Visitor / session id minting for built-in telemetry — the exact scheme
 * the MOMS website's first-party telemetry uses
 * (`FirstPartyTelemetry.tsx` in momsoilchange.com):
 *
 * - visitor id: persisted in localStorage under a JSON envelope with a
 *   90-day TTL (plus a matching cookie), so repeat visits stitch together.
 * - session id: kept in sessionStorage, rolled over after 30 minutes of
 *   inactivity (last-activity timestamp in localStorage).
 *
 * Keys are namespaced per stream so the signed-in app tracker and the
 * public booking tracker never share a session by accident.
 */

const VISITOR_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface TelemetryIds {
  visitorId: () => string;
  sessionId: () => string;
  rotateSession: () => string;
}

export function createTelemetryIds(namespace: string): TelemetryIds {
  const visitorKey = `${namespace}_vid`;
  const sessionKey = `${namespace}_sid`;
  const sessionAtKey = `${namespace}_sat`;

  function readVisitor(): string {
    const now = Date.now();
    try {
      const raw = localStorage.getItem(visitorKey);
      if (raw) {
        try {
          const stored = JSON.parse(raw) as { id?: string; expiresAt?: number };
          if (stored.id && stored.expiresAt && stored.expiresAt > now) return stored.id;
        } catch {
          // Legacy plain-string value — preserve it, like the website does.
          if (!raw.startsWith("{")) return raw;
        }
      }
    } catch {
      // storage unavailable (private mode) — fall through to a fresh id
    }
    return newId();
  }

  function persistVisitor(visitorId: string): void {
    try {
      const expiresAt = Date.now() + VISITOR_TTL_MS;
      localStorage.setItem(visitorKey, JSON.stringify({ id: visitorId, expiresAt }));
      document.cookie = `${visitorKey}=${encodeURIComponent(visitorId)}; Max-Age=${90 * 24 * 60 * 60}; Path=/; SameSite=Lax; Secure`;
    } catch {
      // best effort only
    }
  }

  function visitorId(): string {
    const id = readVisitor();
    persistVisitor(id);
    return id;
  }

  function sessionId(): string {
    const now = Date.now();
    let last = 0;
    try {
      last = Number(localStorage.getItem(sessionAtKey) || 0);
    } catch {
      last = 0;
    }
    let current: string | null = null;
    try {
      current = sessionStorage.getItem(sessionKey);
    } catch {
      current = null;
    }
    if (!current || now - last > SESSION_IDLE_MS) {
      current = newId();
      try {
        sessionStorage.setItem(sessionKey, current);
      } catch {
        // best effort only
      }
    }
    try {
      localStorage.setItem(sessionAtKey, String(now));
    } catch {
      // best effort only
    }
    return current;
  }

  function rotateSession(): string {
    const fresh = newId();
    try {
      sessionStorage.setItem(sessionKey, fresh);
      localStorage.setItem(sessionAtKey, String(Date.now()));
    } catch {
      // best effort only
    }
    return fresh;
  }

  return { visitorId, sessionId, rotateSession };
}
