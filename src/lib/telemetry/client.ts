/**
 * Built-in telemetry — signed-in app stream (client capture core).
 *
 * A faithful port of the MOMS website's first-party collector
 * (`FirstPartyTelemetry.tsx` in momsoilchange.com), adapted for a
 * signed-in app:
 *
 * - Same ids (90-day visitor id, 30-minute-idle session id — see
 *   `./identity-ids`), same event payload shape, same clamps and
 *   classifications (click / outbound_click / cta_click, scroll
 *   milestones at +10%, engagement accrued only while the tab is
 *   visible, page_exit + engagement flushed on pagehide, window errors).
 * - Transport is this app's sanctioned API path (`apiRequest`, which
 *   attaches the Supabase session token) to `POST /v1/telemetry/events`;
 *   the server stamps identity from that token — this module only
 *   *labels* events with the identity the shell already resolved so the
 *   payload mirrors the website's shape. Nothing is sent while signed
 *   out: every send is gated on `identifyTelemetry` having run.
 * - Init is once-only (`initTelemetry`), and every public function is a
 *   safe no-op on the server, before init, or when signed out. Telemetry
 *   must never break a user flow: all sends are fire-and-forget.
 */
import { apiRequest } from "@/lib/api-client";
import { createTelemetryIds } from "./identity-ids";

export interface TelemetryIdentity {
  userId: string;
  email?: string | null;
  workspaceId?: string | null;
  role?: string | null;
}

export type TelemetryEventType =
  | "pageview"
  | "page_exit"
  | "click"
  | "outbound_click"
  | "cta_click"
  | "scroll"
  | "engagement"
  | "error";

export interface TelemetryEventExtra {
  target?: string;
  targetText?: string;
  xRatio?: number;
  yRatio?: number;
  scrollDepth?: number;
  engagedMs?: number;
  metadata?: Record<string, unknown>;
}

const ids = createTelemetryIds("sw");

let initialized = false;
let identity: TelemetryIdentity | null = null;

// Per-page engagement/scroll state, mirroring the website collector.
let maxScroll = 0;
let visibleSince = 0;
let accruedMs = 0;

function deviceClass(): string {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop";
}

function send(eventType: TelemetryEventType, extra: TelemetryEventExtra = {}): void {
  if (typeof window === "undefined" || !identity) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const body = {
      session_id: ids.sessionId(),
      visitor_id: ids.visitorId(),
      event_type: eventType,
      url: window.location.href,
      title: document.title,
      occurred_at: new Date().toISOString(),
      referrer: document.referrer || undefined,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      device_class: deviceClass(),
      utm: {
        source: params.get("utm_source") ?? undefined,
        medium: params.get("utm_medium") ?? undefined,
        campaign: params.get("utm_campaign") ?? undefined,
      },
      workspace_id: identity.workspaceId ?? undefined,
      target: extra.target,
      target_text: extra.targetText,
      x_ratio: extra.xRatio,
      y_ratio: extra.yRatio,
      scroll_depth: extra.scrollDepth,
      engaged_ms: extra.engagedMs,
      metadata: extra.metadata,
    };
    void apiRequest("/v1/telemetry/events", {
      method: "POST",
      // apiRequest JSON-encodes plain-object bodies (see api-client).
      body: body as unknown as BodyInit,
      keepalive: true,
      timeout: 0,
    }).catch(() => undefined);
  } catch {
    // Telemetry never breaks the app.
  }
}

/**
 * Label subsequent events with the signed-in identity the shell
 * resolved. Called by the shell tracker when the Supabase session
 * resolves (and again when workspace/role land).
 */
export function identifyTelemetry(next: TelemetryIdentity): void {
  identity = next;
}

/**
 * Sign-out: stop sending and rotate the client session id so the next
 * person on this browser does not inherit the previous user's session.
 */
export function resetTelemetry(): void {
  identity = null;
  ids.rotateSession();
}

/** Whether an identity is currently bound (sends are live). */
export function isTelemetryIdentified(): boolean {
  return identity !== null;
}

/**
 * Which record a route points at, when it points at one — the signed-in
 * stream records not just that a screen opened, but WHICH customer,
 * invoice, appointment, service or vehicle record it was. That is the
 * whole point for staff activity: "she opened the Customers screen" is
 * trivia; "she opened THIS customer's record" is the fact.
 */
const ENTITY_SEGMENTS: Readonly<Record<string, string>> = {
  customers: "customer",
  invoices: "invoice",
  appointments: "appointment",
  jobs: "job",
  "work-orders": "job",
  services: "service",
  "service-catalog": "service",
  vehicles: "vehicle",
  quotes: "quote",
};

function entityFromPath(pathname: string): { entity_type: string; entity_id: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const entityType = ENTITY_SEGMENTS[segments[0]];
  if (!entityType) return null;
  const candidate = segments[1];
  // Record routes carry an id-shaped segment (uuid or long token); plain
  // words (list tabs, "new", etc.) are screens, not records.
  if (!/^[0-9a-fA-F-]{8,}$/.test(candidate) && !/^\d+$/.test(candidate)) return null;
  return { entity_type: entityType, entity_id: candidate };
}

/** Explicit pageview — the shell tracker calls this on SPA route changes. */
export function trackTelemetryPageview(): void {
  maxScroll = 0;
  if (typeof window === "undefined") {
    send("pageview");
    return;
  }
  const entity = entityFromPath(window.location.pathname);
  send("pageview", { metadata: entity ? { ...entity } : undefined });
}

/** Low-level event send (gated on identity, like every send). */
export function trackTelemetryEvent(eventType: TelemetryEventType, extra: TelemetryEventExtra = {}): void {
  send(eventType, extra);
}

function flushEngagement(final: boolean): void {
  if (!document.hidden && visibleSince) {
    accruedMs += Date.now() - visibleSince;
    visibleSince = Date.now();
  }
  if (accruedMs > 0) {
    send("engagement", { engagedMs: accruedMs, metadata: { maxScroll } });
    accruedMs = 0;
  }
  if (final) send("page_exit", { metadata: { maxScroll } });
}

/**
 * Install the global listeners exactly once (clicks, scroll milestones,
 * visibility-driven engagement accrual, pagehide flush, window errors).
 * Safe to call repeatedly and on the server.
 */
export function initTelemetry(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  visibleSince = document.hidden ? 0 : Date.now();

  const onScroll = () => {
    const height = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const depth = Math.round((window.scrollY / height) * 100);
    if (depth >= maxScroll + 10) {
      maxScroll = Math.min(100, depth);
      send("scroll", { scrollDepth: maxScroll });
    }
  };

  const onClick = (event: MouseEvent) => {
    const el = (event.target as Element | null)?.closest?.("a,button,[role=button]") as HTMLElement | null;
    if (!el) return;
    const href = el instanceof HTMLAnchorElement ? el.href : null;
    const label = (el.innerText || el.getAttribute("aria-label") || "").trim();
    const looksLikeConversion = /book|schedule|appointment|call|phone|contact|quote|get started/i.test(
      `${label} ${href ?? ""}`,
    );
    let eventType: TelemetryEventType = "click";
    if (href) {
      try {
        if (new URL(href, window.location.href).origin !== window.location.origin) {
          eventType = "outbound_click";
        }
      } catch {
        // keep "click"
      }
    }
    if (eventType === "click" && (el.hasAttribute("data-telemetry-cta") || looksLikeConversion)) {
      eventType = "cta_click";
    }
    const docWidth = Math.max(1, document.documentElement.scrollWidth);
    const docHeight = Math.max(1, document.documentElement.scrollHeight);
    send(eventType, {
      target: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ""),
      targetText: label,
      xRatio: event.pageX / docWidth,
      yRatio: event.pageY / docHeight,
      metadata: href ? { href } : undefined,
    });
  };

  const onVisibility = () => {
    if (document.hidden) {
      if (visibleSince) {
        accruedMs += Date.now() - visibleSince;
        visibleSince = 0;
      }
      // Flush engagement when the tab hides — pagehide may never come
      // on mobile, and the website collector accrues on the same signal.
      if (accruedMs > 0) {
        send("engagement", { engagedMs: accruedMs, metadata: { maxScroll } });
        accruedMs = 0;
      }
    } else {
      visibleSince = Date.now();
    }
  };

  const onPageHide = () => flushEngagement(true);

  const onError = (event: ErrorEvent) => {
    send("error", {
      metadata: {
        message: String(event.message || "").slice(0, 300),
        source: String(event.filename || "").slice(0, 300),
      },
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("error", onError);
}
