/**
 * Marketplace tracking — writes marketplace funnel events to the database
 * (`analytics_events`) in addition to PostHog, so provider-facing Marketplace
 * Analytics has a first-party source of truth.
 *
 * Events are deduped per browser session so a refresh does not inflate views.
 */
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/posthog/analytics";
import { attributionProps } from "@/lib/attribution";

/** Legacy column name on analytics_events for the workspace owner id. */
const TENANT_COLUMN = "tenant_id" as const;
const SESSION_KEY = "sw_marketplace_session_id";
const DEDUPE_PREFIX = "sw_mp_evt:";

export const MARKETPLACE_EVENTS = {
  impression: "marketplace_listing_impression",
  view: "marketplace_profile_view",
  bookingClick: "marketplace_booking_click",
  quoteClick: "marketplace_quote_click",
} as const;

export type MarketplaceEventName = (typeof MARKETPLACE_EVENTS)[keyof typeof MARKETPLACE_EVENTS];

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return "anonymous";
  }
}

function alreadySent(key: string): boolean {
  try {
    if (sessionStorage.getItem(DEDUPE_PREFIX + key)) return true;
    sessionStorage.setItem(DEDUPE_PREFIX + key, "1");
    return false;
  } catch {
    return false;
  }
}

interface TrackOptions {
  /** Workspace owner (provider) user id the event belongs to. */
  providerUserId: string | null | undefined;
  bookingSlug?: string | null;
  /** Extra metadata stored with the event. */
  metadata?: Record<string, unknown>;
  /** Dedupe once per session for this key (defaults to event + provider). */
  dedupeKey?: string | null;
}

/**
 * Record a marketplace funnel event. Never throws — analytics must not break
 * the public directory experience.
 */
export async function trackMarketplaceEvent(
  event: MarketplaceEventName,
  { providerUserId, bookingSlug, metadata, dedupeKey }: TrackOptions,
): Promise<void> {
  if (!providerUserId) return;

  const key = dedupeKey === null ? null : dedupeKey ?? `${event}:${providerUserId}`;
  if (key && alreadySent(key)) return;

  const props = {
    organization_id: providerUserId,
    booking_slug: bookingSlug ?? null,
    ...attributionProps(),
    ...(metadata ?? {}),
  };

  trackEvent(event, props);

  try {
    await supabase.from("analytics_events").insert({
      [TENANT_COLUMN]: providerUserId,
      session_id: sessionId(),
      event_name: event,
      metadata: props as never,
    } as never);
  } catch {
    /* analytics is best-effort */
  }
}
