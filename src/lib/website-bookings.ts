/**
 * Website Bookings → Service Writer selective push — shared types and pure
 * logic. Used by the staff queue UI (via the application commands), the Hono
 * routes in src/server/hono/routes/website-bookings.ts, and the server logic
 * in src/server/website-bookings/.
 *
 * The push is manual and selective by design (spec:
 * goals/service-writer-app-redesign-and-repo/files/
 * website-bookings-selective-push-spec.md). Nothing in this module performs
 * I/O.
 */

export interface WebsiteBookingVehicle {
  year: number;
  make: string;
  model: string;
  engine: string | null;
}

/** Shape returned by the website backend's internal endpoint (export shape). */
export interface WebsiteBooking {
  id: string;
  customer: string;
  email: string | null;
  phone: string | null;
  address: string;
  payment: string | null;
  quoted_total_usd: number;
  scheduled_start: string;
  scheduled_end: string | null;
  service: string;
  source_channel: string | null;
  status: string;
  vehicle: WebsiteBookingVehicle | null;
  pushed_sw_appointment_id?: string | null;
  pushed_at?: string | null;
}

export type WebsiteBookingListStatus = "unpushed" | "never_push" | "pushed";

export interface AppointmentLite {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  guest_phone: string | null;
  title: string | null;
  vehicle: { year: number; make: string; model: string } | null;
}

export interface DuplicateCandidate {
  appointment_id: string;
  starts_at: string;
  label: string;
  reason: "phone_match" | "customer_vehicle_match";
}

export interface OverlapFlag {
  appointment_id: string;
  starts_at: string;
  label: string;
}

export interface PushPreview {
  booking: WebsiteBooking;
  /** Non-null when this booking cannot be pushed at all (reason shown). */
  blocked_reason: string | null;
  warnings: string[];
  customer_match: { kind: "existing" | "new"; customer_id: string | null; label: string };
  service_match: { catalog_id: string | null; name: string };
  geocode: { lat: number; lng: number } | null;
  scheduled: { date: string; time: string; duration_minutes: number };
  duplicate_candidates: DuplicateCandidate[];
  overlaps: OverlapFlag[];
  /** Website booking ids in the same prepare batch whose windows overlap. */
  batch_overlap_booking_ids: string[];
}

export type PushDecisionAction = "push" | "link" | "skip" | "hold";

export interface PushDecision {
  booking_id: string;
  action: PushDecisionAction;
  link_appointment_id?: string | null;
}

export interface PushResult {
  booking_id: string;
  status: "created" | "linked" | "skipped" | "failed";
  appointment_id: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function phoneDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

/** Last-10-digits comparison key, mirroring the booking RPCs' phone match. */
export function phoneKey(value: string | null | undefined): string {
  const digits = phoneDigits(value);
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** Same acceptance rule as the booking RPCs: length >= 3 and '@' not first. */
export function isValidEmailLoose(value: string | null | undefined): boolean {
  const email = String(value ?? "").trim();
  return email.length >= 3 && email.indexOf("@") >= 1;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function windowsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a0 = Date.parse(aStart);
  const a1 = Date.parse(aEnd);
  const b0 = Date.parse(bStart);
  const b1 = Date.parse(bEnd);
  if ([a0, a1, b0, b1].some((n) => Number.isNaN(n))) return false;
  return a0 < b1 && a1 > b0;
}

function zonedParts(iso: string, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const out: Record<string, string> = {};
  for (const part of parts) out[part.type] = part.value;
  return out;
}

/** Local calendar date (YYYY-MM-DD) of an instant in the workspace timezone. */
export function localDateInTimezone(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Split a website booking's window into the (date, time, duration) triple the
 * booking RPCs take, expressed in the workspace timezone so the RPC rebuilds
 * the exact same instant.
 */
export function splitScheduledStart(
  startIso: string,
  endIso: string | null,
  timeZone: string,
): { date: string; time: string; durationMinutes: number } {
  const p = zonedParts(startIso, timeZone);
  let durationMinutes = 60;
  if (endIso) {
    const diff = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
    if (diff >= 1 && diff <= 1440) durationMinutes = diff;
  }
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    durationMinutes,
  };
}

export function normalizeServiceName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * Resolve a website service name to a Service Writer catalog entry: exact
 * case-insensitive match first, then a punctuation-insensitive match.
 * Returns the catalog id or null (unresolvable = push blocked, spec §4).
 */
export function matchServiceCatalogId(
  catalog: Array<{ id: string; name: string }>,
  serviceName: string,
): string | null {
  const wanted = serviceName.trim().toLowerCase();
  const exact = catalog.find((s) => s.name.trim().toLowerCase() === wanted);
  if (exact) return exact.id;
  const normalized = normalizeServiceName(serviceName);
  const fuzzy = catalog.find((s) => normalizeServiceName(s.name) === normalized);
  return fuzzy ? fuzzy.id : null;
}

function vehicleMatches(
  a: { year: number; make: string; model: string } | null,
  b: WebsiteBookingVehicle | null,
): boolean {
  if (!a || !b) return false;
  return (
    a.year === b.year &&
    a.make.trim().toLowerCase() === b.make.trim().toLowerCase() &&
    a.model.trim().toLowerCase() === b.model.trim().toLowerCase()
  );
}

/**
 * Duplicate detection (spec §5.3 / §7A). `appointments` must already be
 * limited to the booking's local date in the workspace timezone. A candidate
 * is the same job if the phone matches, or the matched customer + vehicle
 * match. Cancelled / no-show appointments never count.
 */
export function findDuplicateCandidates(
  booking: WebsiteBooking,
  appointments: AppointmentLite[],
  matchedCustomerId: string | null,
): DuplicateCandidate[] {
  const bookingPhone = phoneKey(booking.phone);
  const out: DuplicateCandidate[] = [];
  for (const appt of appointments) {
    if (appt.status === "cancelled" || appt.status === "no_show") continue;
    const label = appt.title || "Appointment";
    if (bookingPhone && phoneKey(appt.guest_phone) === bookingPhone) {
      out.push({ appointment_id: appt.id, starts_at: appt.starts_at, label, reason: "phone_match" });
      continue;
    }
    if (matchedCustomerId && appt.customer_id === matchedCustomerId && vehicleMatches(appt.vehicle, booking.vehicle)) {
      out.push({ appointment_id: appt.id, starts_at: appt.starts_at, label, reason: "customer_vehicle_match" });
    }
  }
  return out;
}

/** Overlap flags (spec §7B): warn-only, never block, never move a time. */
export function findOverlaps(
  booking: WebsiteBooking,
  appointments: AppointmentLite[],
  excludeIds: Set<string>,
): OverlapFlag[] {
  const start = booking.scheduled_start;
  const end = booking.scheduled_end ?? booking.scheduled_start;
  return appointments
    .filter((appt) => appt.status !== "cancelled" && appt.status !== "no_show")
    .filter((appt) => !excludeIds.has(appt.id))
    .filter((appt) => windowsOverlap(start, end, appt.starts_at, appt.ends_at))
    .map((appt) => ({ appointment_id: appt.id, starts_at: appt.starts_at, label: appt.title || "Appointment" }));
}

/**
 * The stored total of a pushed appointment, computed the way the canonical
 * financial path does: billable item sum + metadata tax. Falls back to the
 * metadata estimated cost when no items exist.
 */
export function computeStoredTotal(
  metadata: Record<string, unknown> | null,
  items: Array<{ quantity: unknown; unit_price: unknown }>,
): number {
  const tax = Number(metadata?.tax_amount ?? 0) || 0;
  if (items.length > 0) {
    const sum = items.reduce((acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
    return roundMoney(sum + tax);
  }
  return roundMoney((Number(metadata?.estimated_cost ?? 0) || 0) + tax);
}

export function vehicleLabel(vehicle: WebsiteBookingVehicle | null): string {
  if (!vehicle) return "Vehicle not recorded";
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.engine ? ` (${vehicle.engine})` : ""}`;
}

export function appointmentTitle(booking: WebsiteBooking): string {
  const vehicle = booking.vehicle ? `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}` : "";
  return (vehicle ? `${booking.service} — ${vehicle}` : booking.service).slice(0, 500);
}

export function appointmentDescription(booking: WebsiteBooking): string {
  return `${booking.service} for ${vehicleLabel(booking.vehicle)} — booked on the MOMS website.`;
}

export function staffNote(booking: WebsiteBooking): string {
  const channel = booking.source_channel ?? "website";
  const payment = booking.payment ?? "unknown";
  return `Pushed from MOMS website booking ${booking.id}. Source: ${channel}. Website payment status: ${payment}.`;
}
