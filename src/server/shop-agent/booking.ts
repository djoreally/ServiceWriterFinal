/**
 * Shop Agent — booking seam (Phase 1).
 *
 * ONE booking path: everything here goes through `bookAppointmentCore`
 * (src/server/appointments/book-appointment.ts), the same core the
 * POST /v1/appointments route uses. There is no agent side path.
 *
 * AUTHORITY NOTE: these functions take an admin supabase client and do NOT
 * see a user JWT. Authority for agent bookings comes from ZeroPolicy —
 * callers must run `checkPolicy(workspace_id, "create_appointment", ctx)`
 * and only call `book` when the decision is `act`. The booking core itself
 * is authority-agnostic; it validates and inserts like the route does, with
 * `created_by` left null (the public_booking RPC precedent — unauthenticated
 * booking paths insert without created_by).
 */
import { configuredHours, bookAppointmentCore } from "@/server/appointments/book-appointment";
import { zonedLocalDateTimeToUtc } from "@/server/scheduling/timezone";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentSlot {
  startsAt: string; // UTC ISO
  endsAt: string; // UTC ISO
  /** e.g. "Tue 10:30 AM" (workspace-local) */
  label: string;
}

export interface AgentBookingInput {
  customerId: string;
  vehicleId?: string | null;
  serviceCatalogId?: string | null;
  startsAt: string; // UTC ISO — must be one of the offered slots
  endsAt: string; // UTC ISO
  notes?: string | null;
  estimatedCost?: number | null;
}

// ---------------------------------------------------------------------------
// Agent booking
// ---------------------------------------------------------------------------

/**
 * Book an appointment as the Shop Agent. The caller must have a ZeroPolicy
 * `act` decision for `create_appointment` before invoking this.
 * Returns `{ data }` with the inserted appointment, or `{ error }` holding
 * the client-facing error Response from the booking core (outside_business_hours,
 * schedule_conflict, …) so the conversation layer can hand off gracefully.
 */
export async function bookAppointmentAsAgent(
  supabase: any,
  workspaceId: string,
  input: AgentBookingInput,
): Promise<{ data: unknown } | { error: Response }> {
  return bookAppointmentCore(
    supabase,
    {
      workspace_id: workspaceId,
      customer_id: input.customerId,
      vehicle_id: input.vehicleId ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      source: "shop-agent-sms",
      status: "confirmed",
      notes: input.notes ?? null,
      service_catalog_id: input.serviceCatalogId ?? null,
      estimated_cost: input.estimatedCost ?? null,
      // The agent never bypasses availability checks — slots come from
      // getAvailableSlots, and the core re-validates at book time.
      override_availability: false,
    },
    { createdBy: null },
  );
}

// ---------------------------------------------------------------------------
// Customer matching
// ---------------------------------------------------------------------------

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+") ? `+${digits}` : digits;
}

/**
 * Look up a customer by phone within the workspace; create a minimal record
 * when absent. Matches against the raw input, the normalized form, and the
 * digits-only form (shops store phones in mixed formats). The created record
 * mirrors the public_booking RPC's minimal insert and tags its provenance in
 * metadata.
 */
export async function findOrCreateCustomerByPhone(
  supabase: any,
  workspaceId: string,
  phone: string,
  name?: string,
): Promise<{ id: string; created: boolean }> {
  const normalized = normalizePhone(phone);
  const digitsOnly = normalized.replace(/\D/g, "");
  const variants = [...new Set([phone.trim(), normalized, digitsOnly].filter(Boolean))];

  const { data: existing, error: lookupError } = await supabase
    .from("customers")
    .select("id,first_name")
    .eq("workspace_id", workspaceId)
    .in("phone", variants)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return { id: existing.id, created: false };

  const trimmedName = (name ?? "").trim();
  const [firstName, ...rest] = trimmedName.split(/\s+/);
  const { data: created, error: insertError } = await supabase
    .from("customers")
    .insert({
      workspace_id: workspaceId,
      first_name: firstName || null,
      last_name: rest.length ? rest.join(" ") : null,
      phone: normalized,
      metadata: { source: "shop-agent-sms" },
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return { id: created.id, created: true };
}

// ---------------------------------------------------------------------------
// Slot search (read-only)
// ---------------------------------------------------------------------------

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateString(timeZone: string, date: Date): string {
  // en-CA yields YYYY-MM-DD — calendar arithmetic stays DST-safe.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function weekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

function minutesToLabel(dateStr: string, startMinutes: number): string {
  const h = Math.floor(startMinutes / 60);
  const m = startMinutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${SHORT_WEEKDAYS[weekdayIndex(dateStr)]} ${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Find up to 3 bookable slots for a service over the next `days` days.
 *
 * No availability RPC exists in the booking system, so this is newly written
 * — but it reuses the booking path's own semantics: `configuredHours` for
 * open windows, `min_lead_time_hours` for the booking floor, the
 * workspace_blackout_dates table, and the conflict query shape from
 * bookAppointmentCore (non-cancelled/no-show appointments, expanded by
 * buffer_time_before/after). Read-only queries; never invents slots.
 */
export async function getAvailableSlots(
  supabase: any,
  workspaceId: string,
  serviceId: string,
  days = 7,
): Promise<AgentSlot[]> {
  const db = supabase as any;
  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }, { data: service, error: serviceError }] =
    await Promise.all([
      supabase.from("workspaces").select("timezone").eq("id", workspaceId).single(),
      supabase
        .from("workspace_settings")
        .select(
          "day_hours,opening_time,closing_time,working_days,buffer_time_before,buffer_time_after," +
            "min_lead_time_hours,max_advance_days,slot_duration_minutes",
        )
        .eq("workspace_id", workspaceId)
        .single(),
      supabase
        .from("service_catalog")
        .select("id,estimated_minutes")
        .eq("workspace_id", workspaceId)
        .eq("id", serviceId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  if (serviceError) throw serviceError;

  const timezone = workspace?.timezone || "UTC";
  const now = new Date();
  const maxAdvance = Math.max(1, Number(settings?.max_advance_days ?? days) || days);
  const horizonDays = Math.min(Math.max(1, days), maxAdvance);
  const durationMinutes = Math.max(5, Number(service?.estimated_minutes) || Number(settings?.slot_duration_minutes) || 30);
  const stepMinutes = Math.max(5, Number(settings?.slot_duration_minutes) || 30);
  const leadMs = Math.max(0, Number(settings?.min_lead_time_hours || 0)) * 3600000;
  const earliestStartMs = now.getTime() + leadMs;
  const bufferBeforeMs = Math.max(0, Number(settings?.buffer_time_before || 0)) * 60000;
  const bufferAfterMs = Math.max(0, Number(settings?.buffer_time_after || 0)) * 60000;

  const todayLocal = localDateString(timezone, now);
  const horizonEndLocal = addDays(todayLocal, horizonDays);

  const [{ data: blackoutDates, error: blackoutError }, { data: existing, error: existingError }] = await Promise.all([
    db
      .from("workspace_blackout_dates")
      .select("blocked_date")
      .eq("workspace_id", workspaceId)
      .gte("blocked_date", todayLocal)
      .lt("blocked_date", horizonEndLocal),
    supabase
      .from("appointments")
      .select("starts_at,ends_at")
      .eq("workspace_id", workspaceId)
      .not("status", "in", '("cancelled","no_show")')
      .gte("starts_at", now.toISOString())
      .lt("starts_at", zonedLocalDateTimeToUtc(horizonEndLocal, "00:00:00", timezone).toISOString())
      .order("starts_at", { ascending: true }),
  ]);
  if (blackoutError) throw blackoutError;
  if (existingError) throw existingError;

  const blackout = new Set(((blackoutDates ?? []) as Array<{ blocked_date: string }>).map((row) => row.blocked_date));
  const booked = ((existing ?? []) as Array<{ starts_at: string; ends_at: string }>).map((row) => ({
    startMs: Date.parse(row.starts_at),
    endMs: Date.parse(row.ends_at),
  }));

  const slots: AgentSlot[] = [];
  for (let dayOffset = 0; dayOffset < horizonDays && slots.length < 3; dayOffset += 1) {
    const dateStr = addDays(todayLocal, dayOffset);
    if (blackout.has(dateStr)) continue;
    const hours = configuredHours(settings, WEEKDAY_NAMES[weekdayIndex(dateStr)]);
    if (!hours.isOpen) continue;

    for (
      let startMinutes = hours.open;
      startMinutes + durationMinutes <= hours.close && slots.length < 3;
      startMinutes += stepMinutes
    ) {
      const startsAt = zonedLocalDateTimeToUtc(dateStr, minutesToTime(startMinutes), timezone);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
      if (startsAt.getTime() < earliestStartMs) continue;
      const candidateStart = startsAt.getTime();
      const candidateEnd = endsAt.getTime();
      // Same overlap shape as bookAppointmentCore: existing appointments
      // expanded by buffer_after on the candidate start side and
      // buffer_before on the candidate end side.
      const overlaps = booked.some(
        (appt) => appt.startMs < candidateEnd + bufferBeforeMs && appt.endMs > candidateStart - bufferAfterMs,
      );
      if (overlaps) continue;
      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        label: minutesToLabel(dateStr, startMinutes),
      });
    }
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Booking port — the seam the conversation layer (Worker C) builds against.
// ---------------------------------------------------------------------------

export const bookingPort = {
  getSlots: getAvailableSlots,
  book: bookAppointmentAsAgent,
  findOrCreateCustomer: findOrCreateCustomerByPhone,
};

export type BookingPort = typeof bookingPort;
