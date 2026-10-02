/**
 * Shop Agent — canonical shop profile reader (Phase 0/1).
 *
 * Builds the ShopProfile contract (src/server/shop-agent/zeroai/types.ts)
 * from the existing ServiceWriter models — no parallel tables:
 *   identity/hours/service_area  <- workspaces + workspace_settings
 *   services                      <- service_catalog (is_active)
 *   brandVoice/policies/escalation <- OPTIONAL. workspace_settings
 *                                    operational_settings agent_* keys when
 *                                    present; undefined otherwise (fallback
 *                                    behavior per spec — never fail).
 *
 * Schema notes (verified against supabase/migrations):
 * - workspaces has NO phone column — the public phone is
 *   workspace_settings.phone.
 * - workspace_settings has no structured towns/zips columns; serviceArea is
 *   derived from city/postal_code (+ service_radius_miles) until a structured
 *   service-area field exists.
 */
import { configuredHours } from "@/server/appointments/book-appointment";
import type { BusinessHours, ServiceProfile, ShopProfile } from "./zeroai/types";

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Build BusinessHours from workspace_settings with the SAME semantics as the
 * booking path's configuredHours: day_hours[weekday].is_open/isOpen/open/close
 * first, then the working_days + opening_time/closing_time fallback.
 */
export function buildBusinessHours(timezone: string, settings: any): BusinessHours {
  const days: BusinessHours["days"] = {};
  for (const weekday of WEEKDAYS) {
    const hours = configuredHours(settings, weekday);
    days[weekday] = hours.isOpen
      ? { open: minutesToHHMM(hours.open), close: minutesToHHMM(hours.close) }
      : null;
  }
  return { timezone, days };
}

interface LocalParts {
  date: string;
  weekday: string;
  minutes: number;
}

function localParts(iso: string, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const text = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value || "";
  return {
    date: `${text("year")}-${text("month")}-${text("day")}`,
    weekday: text("weekday").toLowerCase(),
    minutes: Number(text("hour")) * 60 + Number(text("minute")),
  };
}

/**
 * Minutes since local midnight in `timezone` for `date` (default: now).
 * Pure helper — reused by the booking seam for slot labels and lead checks.
 */
export function currentLocalMinutes(timeZone: string, date: Date = new Date()): number {
  return localParts(date.toISOString(), timeZone).minutes;
}

/** Weekday (lowercase, e.g. "monday") of `date` in `timeZone`. */
export function localWeekday(timeZone: string, date: Date = new Date()): string {
  return localParts(date.toISOString(), timeZone).weekday;
}

/**
 * True when `date` falls inside the profile's configured open hours.
 * Boundary semantics match the booking path: start must be >= open and
 * strictly inside the window (end <= close is enforced by the booking core).
 */
export function isWithinBusinessHours(profile: ShopProfile, date: Date): boolean {
  const { weekday, minutes } = localParts(date.toISOString(), profile.hours.timezone);
  const day = profile.hours.days[weekday];
  if (!day) return false;
  const [openH, openM] = day.open.split(":").map(Number);
  const [closeH, closeM] = day.close.split(":").map(Number);
  const open = openH * 60 + openM;
  const close = closeH * 60 + closeM;
  return minutes >= open && minutes < close;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read the canonical shop profile for a workspace.
 *
 * completenessScore: % of the 5 required Phase 1 fields filled —
 *   businessName, timezone, >=1 open day, >=1 active service, publicPhone.
 * An empty serviceArea is advisory: it is noted in missingFields but does
 * not lower the score (Phase 1 does not enforce service-area scoping the
 * same way it enforces the 5 required fields).
 */
export async function getShopProfile(supabase: any, workspaceId: string): Promise<ShopProfile> {
  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }, { data: services, error: servicesError }] =
    await Promise.all([
      supabase.from("workspaces").select("id,name,timezone").eq("id", workspaceId).single(),
      supabase
        .from("workspace_settings")
        .select(
          "phone,email,website_url,booking_slug,address_line1,address_line2,city,region,postal_code," +
            "service_radius_miles,day_hours,opening_time,closing_time,working_days,operational_settings",
        )
        .eq("workspace_id", workspaceId)
        .single(),
      supabase
        .from("service_catalog")
        .select("id,name,description,labor_price,estimated_minutes,category,is_active")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("name"),
    ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  if (servicesError) throw servicesError;

  const businessName = (workspace?.name as string | undefined) ?? "";
  const timezone = (workspace?.timezone as string | undefined) ?? "";
  const hours = buildBusinessHours(timezone || "UTC", settings);
  const openDays = WEEKDAYS.filter((day) => hours.days[day] !== null);

  const serviceProfiles: ServiceProfile[] = ((services ?? []) as any[]).map((row) => {
    const price = row.labor_price == null ? undefined : Number(row.labor_price);
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      priceMin: price,
      // ServiceWriter stores one labor price per catalog row — quote it as a
      // fixed price, not a range (no invention).
      priceMax: price,
      estimatedMinutes: row.estimated_minutes ?? undefined,
      category: row.category ?? undefined,
    };
  });

  // workspace_settings.phone is the shop's public number — workspaces has no
  // phone column.
  const publicPhone = (settings?.phone as string | undefined) || undefined;
  const publicEmail = (settings?.email as string | undefined) || undefined;
  const bookingSlug = (settings?.booking_slug as string | undefined) || undefined;
  const websiteUrl = (settings?.website_url as string | undefined) || undefined;
  // Public booking page lives at /book/[slug]; host comes from the shop's own
  // configured website_url.
  const bookingUrl = bookingSlug && websiteUrl ? `${websiteUrl.replace(/\/+$/, "")}/book/${bookingSlug}` : undefined;

  const city = (settings?.city as string | undefined) || undefined;
  const postalCode = (settings?.postal_code as string | undefined) || undefined;
  const radiusMiles = settings?.service_radius_miles == null ? undefined : Number(settings.service_radius_miles);
  const serviceArea = {
    towns: city ? [city] : [],
    zips: postalCode ? [postalCode] : [],
    radiusMiles,
  };

  // Optional Phase 1 sections. The agent_profile table recommended by the
  // Phase 0 spec does not exist yet, so the only structured home is
  // operational_settings agent_* keys; otherwise undefined (fallback per spec).
  const operational = isRecord(settings?.operational_settings) ? settings.operational_settings : {};
  const brandVoice = typeof operational.agent_brand_voice === "string" ? operational.agent_brand_voice : undefined;
  const policies = isRecord(operational.agent_policies)
    ? (operational.agent_policies as Record<string, string>)
    : undefined;
  const escalation = isRecord(operational.agent_escalation)
    ? {
        ownerPhone:
          typeof operational.agent_escalation.ownerPhone === "string"
            ? operational.agent_escalation.ownerPhone
            : undefined,
        callbackPromise:
          typeof operational.agent_escalation.callbackPromise === "string"
            ? operational.agent_escalation.callbackPromise
            : undefined,
      }
    : undefined;

  const missingFields: string[] = [];
  let filled = 0;
  if (businessName) filled += 1; else missingFields.push("businessName");
  if (timezone) filled += 1; else missingFields.push("timezone");
  if (openDays.length > 0) filled += 1; else missingFields.push("hours");
  if (serviceProfiles.length > 0) filled += 1; else missingFields.push("services");
  if (publicPhone) filled += 1; else missingFields.push("publicPhone");
  if (serviceArea.towns.length === 0 && serviceArea.zips.length === 0) {
    // Advisory: noted for the setup checklist, not scored.
    missingFields.push("serviceArea");
  }
  const completenessScore = Math.round((filled / 5) * 100);

  return {
    workspaceId,
    businessName,
    publicPhone,
    publicEmail,
    bookingUrl,
    brandVoice,
    hours,
    serviceArea,
    services: serviceProfiles,
    policies,
    escalation,
    completenessScore,
    missingFields,
  };
}
