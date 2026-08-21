/**
 * Marketplace / marketing attribution capture.
 *
 * Captures UTM parameters and the external referrer once per browser session
 * so the directory → booking funnel can be attributed even after cross-page
 * navigation (or a cross-domain hop into a tenant booking subdomain).
 */

const STORAGE_KEY = "sw_attribution_v1";

export interface AttributionSnapshot {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null
  referrer: string | null;
  landing_path: string | null;
  channel: string;
  captured_at: string;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

function readStored(): AttributionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AttributionSnapshot) : null;
  } catch {
    return null;
  }
}

function persist(snapshot: AttributionSnapshot) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage may be unavailable (private mode) — attribution is best-effort.
  }
}

/**
 * Capture attribution on entry to a public surface. First capture in a session
 * wins so mid-funnel navigation never overwrites the original source.
 */
export function captureAttribution(channel: string): AttributionSnapshot | null {
  if (typeof window === "undefined") return null;

  const existing = readStored();
  if (existing) return existing;

  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer || null;
  const isInternalReferrer = Boolean(referrer && referrer.includes(window.location.host));

  const snapshot: AttributionSnapshot = {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_term: params.get("utm_term"),
    utm_content: params.get("utm_content"),
    referrer: isInternalReferrer ? null : referrer,
    landing_path: window.location.pathname,
    channel,
    captured_at: new Date().toISOString(),
  };

  persist(snapshot);
  return snapshot;
}

export function getAttribution(): AttributionSnapshot | null {
  return readStored();
}

/** Flat, analytics-safe property bag for event payloads. */
export function attributionProps(): Record<string, string | null> {
  const snapshot = readStored();
  if (!snapshot) return {};
  const props: Record<string, string | null> = {
    attribution_channel: snapshot.channel,
    referrer: snapshot.referrer,
    landing_path: snapshot.landing_path,
  };
  UTM_KEYS.forEach((key) => {
    props[key] = snapshot[key];
  });
  return props;
}

/**
 * Resolved booking source for persisted records. Falls back to the caller's
 * default when no directory/marketing attribution exists for the session.
 */
export function resolveBookingSource(fallback = "public_booking"): string {
  const snapshot = readStored();
  if (!snapshot) return fallback;
  if (snapshot.channel === "provider_directory") return "provider_directory";
  if (snapshot.utm_source) return `utm:${snapshot.utm_source}`;
  return fallback;
}

/** Forward the current query string onto an outbound URL, preserving attribution. */
export function withCurrentQuery(url: string): string {
  if (typeof window === "undefined") return url;
  const search = window.location.search;
  if (!search || search === "?") return url;
  return url.includes("?") ? `${url}&${search.slice(1)}` : `${url}${search}`;
}
