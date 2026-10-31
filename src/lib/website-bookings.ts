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

export interface WebsiteBookingJobVehicle {
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  vin: string | null;
}

/**
 * One vehicle + service on a website booking, with that job's own price
 * components (mirroring Service Writer's native per-vehicle fee lines).
 * Legacy bookings (created before the backend served components) carry
 * all-zero components with a correct `total_usd`.
 */
export interface WebsiteBookingJob {
  position: number;
  service_id: string | null;
  /** The exact Service Writer service_catalog UUID for this job, sent by
   * the website backend (SW catalog is the master record). This is the same
   * binding the Service Writer API itself is designed around: the public
   * catalog serves record ids and booking create takes `service_catalog_id`
   * (see bookyouroilchangeext/docs/service-writer-api-audit.md). The wire
   * alias below is the API-contract spelling; `resolveBookingJobs`
   * normalizes either spelling into this field. Optional: older feed
   * payloads omit it and resolution falls back to name matching. */
  serviceCatalogId?: string | null;
  /** Wire spelling of the catalog binding, per the SW API contract. */
  service_catalog_id?: string | null;
  service_name: string;
  vehicle: WebsiteBookingJobVehicle | null;
  subtotal_usd: number;
  waste_fee_usd: number;
  processing_fee_usd: number;
  tax_usd: number;
  total_usd: number;
  duration_minutes: number;
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
  /** What the customer typed in the website booking form's notes field
   * (the backend's bookings.notes — free-form customer text). This is the
   * ONLY text a push may put in the appointment's notes. Absent/null when
   * the customer wrote nothing or the backend payload predates the field. */
  notes?: string | null;
  vehicle: WebsiteBookingVehicle | null;
  /** Every job on the booking. The top-level `service` / `vehicle` /
   * `quoted_total_usd` remain the first job's + the booking total. May be
   * absent on older feed payloads — use `resolveBookingJobs`. */
  jobs?: WebsiteBookingJob[];
  pushed_sw_appointment_id?: string | null;
  pushed_at?: string | null;
  /** Set when a prepaid auto-push attempt failed; the booking stays in
   * the unpushed queue and this is the pipeline's reason, shown to staff. */
  auto_push_last_error?: string | null;
  auto_push_last_attempt_at?: string | null;
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

/**
 * Result of one automatic (prepaid) push attempt. `already_pushed` is the
 * duplicate-trigger outcome: the booking was already stamped, nothing was
 * created, and `appointment_id` is the existing appointment.
 */
export interface AutoPushResult {
  booking_id: string;
  status: "created" | "linked" | "already_pushed" | "failed";
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

/**
 * Resolve a job's catalog service, preferring the exact catalog record id
 * the website backend sends (`serviceCatalogId`). `catalog` must already be
 * the appointment workspace's ACTIVE catalog (callers load it scoped by
 * workspace_id + is_active), so an incoming id can only ever resolve to an
 * active service in that same workspace — never another workspace's row,
 * never an inactive one. When the id is absent or does not resolve, the
 * existing name matching decides, unchanged.
 */
export function resolveServiceCatalogId(
  catalog: Array<{ id: string; name: string }>,
  serviceName: string,
  serviceCatalogId?: string | null,
): string | null {
  const wantedId = typeof serviceCatalogId === "string" ? serviceCatalogId.trim() : "";
  if (wantedId && catalog.some((s) => s.id === wantedId)) return wantedId;
  return matchServiceCatalogId(catalog, serviceName);
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

/**
 * The appointment notes for a pushed booking: exactly what the customer
 * entered on the website, trimmed — or null when they entered nothing.
 * System provenance (booking id, source channel, website payment status)
 * is NEVER written into notes; the push RPC records it in the
 * appointment's metadata (website_booking_id / source_channel /
 * website_payment_status) instead. (Ty's standing rule: notes are the
 * customer's words only.)
 */
export function customerNotes(booking: WebsiteBooking): string | null {
  const notes = (booking.notes ?? "").trim();
  return notes ? notes : null;
}

// ---------------------------------------------------------------------------
// Per-job structure (each vehicle is its own record)
// ---------------------------------------------------------------------------

/**
 * The booking's jobs in position order. Feed payloads without jobs (or
 * with an empty list) synthesize a single job from the top-level fields:
 * total only, all price components 0 — the legacy shape.
 */
export function resolveBookingJobs(booking: WebsiteBooking): WebsiteBookingJob[] {
  const raw = Array.isArray(booking.jobs) ? booking.jobs.filter((j) => j && typeof j === "object") : [];
  if (raw.length > 0) {
    return [...raw]
      .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
      .map((job) => ({
        ...job,
        // One normalized catalog binding regardless of wire spelling.
        serviceCatalogId: job.serviceCatalogId ?? job.service_catalog_id ?? null,
      }));
  }
  return [
    {
      position: 0,
      service_id: null,
      serviceCatalogId: null,
      service_name: booking.service,
      vehicle: booking.vehicle
        ? {
            year: booking.vehicle.year,
            make: booking.vehicle.make,
            model: booking.vehicle.model,
            engine: booking.vehicle.engine,
            vin: null,
          }
        : null,
      subtotal_usd: 0,
      waste_fee_usd: 0,
      processing_fee_usd: 0,
      tax_usd: 0,
      total_usd: booking.quoted_total_usd,
      duration_minutes: 0,
    },
  ];
}

/** A booking with `jobs` guaranteed present (feed normalization). */
export function normalizeWebsiteBooking(booking: WebsiteBooking): WebsiteBooking {
  return { ...booking, jobs: resolveBookingJobs(booking) };
}

export function jobVehicleLabel(vehicle: WebsiteBookingJobVehicle | null): string {
  if (!vehicle) return "Vehicle not recorded";
  const base = [vehicle.year, vehicle.make, vehicle.model]
    .map((part) => (part === null || part === undefined ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" ");
  return `${base || "Vehicle not recorded"}${vehicle.engine ? ` (${vehicle.engine})` : ""}`;
}

function jobVehicleShort(vehicle: WebsiteBookingJobVehicle | null): string {
  if (!vehicle) return "";
  return [vehicle.year, vehicle.make, vehicle.model]
    .map((part) => (part === null || part === undefined ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" ");
}

function distinctJobServices(jobs: WebsiteBookingJob[], fallback: string): string {
  const names: string[] = [];
  for (const job of jobs) {
    const name = (job.service_name || "").trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names.length > 0 ? names.join(" + ") : fallback;
}

/** Multi-job title: "<services> — <vehicle> + <vehicle>" (single-job parity
 * with `appointmentTitle` when the top-level fields mirror the first job). */
export function appointmentTitleForJobs(booking: WebsiteBooking, jobs: WebsiteBookingJob[]): string {
  const services = distinctJobServices(jobs, booking.service);
  const vehicles = jobs.map((job) => jobVehicleShort(job.vehicle)).filter(Boolean);
  return (vehicles.length > 0 ? `${services} — ${vehicles.join(" + ")}` : services).slice(0, 500);
}

export function appointmentDescriptionForJobs(booking: WebsiteBooking, jobs: WebsiteBookingJob[]): string {
  const services = distinctJobServices(jobs, booking.service);
  const labels = jobs.map((job) => jobVehicleLabel(job.vehicle));
  return `${services} for ${labels.join(" + ")} — booked on the MOMS website.`;
}

// Fee-line conventions mirror the invoice sync's native fee lines
// (sync_appointment_invoice_v1): same descriptions, same fee_keys
// (metadata), so a per-job fee item reads identically once the sync
// rebuilds invoice lines from appointment items.
export const WASTE_FEE_DESCRIPTION = "Waste Oil Disposal Fee";
export const PROCESSING_FEE_DESCRIPTION = "Card Processing Fee";
export const TAX_FEE_DESCRIPTION = "Tax";
export const WASTE_FEE_KEY = "waste_oil_fee";
export const PROCESSING_FEE_KEY = "surcharge";
export const TAX_FEE_KEY = "tax";

export interface PerJobItemDraft {
  item_type: "service" | "fee";
  description: string;
  quantity: 1;
  unit_price: number;
  service_catalog_id: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
}

/**
 * Build the per-job appointment items for a pushed booking. Pure: the
 * caller resolves each job's Service Writer vehicle id and catalog id.
 *
 * Per job: one service item at the job subtotal, plus one fee item per
 * non-zero component (waste / processing / tax), every item pinned to
 * the job's vehicle via metadata.vehicle_id. A job whose components are
 * all zero but whose total is positive (legacy booking) collapses to a
 * single service item at its total — the pre-existing behavior, per job.
 *
 * Invariant: the drafts sum to `quotedTotalUsd` to the cent. Any
 * residual (component rounding drift) is applied to the LAST job's
 * service item and reported via `residualUsd` so the caller can log it.
 */
export function buildPerJobItems(input: {
  bookingId: string;
  quotedTotalUsd: number;
  jobs: WebsiteBookingJob[];
  vehicleIds: Array<string | null>;
  catalogIds: Array<string | null>;
}): { items: PerJobItemDraft[]; taxTotalUsd: number; residualUsd: number } {
  const items: PerJobItemDraft[] = [];
  const serviceItemByJob: Array<PerJobItemDraft | null> = [];
  let taxTotal = 0;

  input.jobs.forEach((job, index) => {
    const vehicleId = input.vehicleIds[index] ?? null;
    const baseMetadata: Record<string, unknown> = {
      source: "website_push",
      price_source: "website_quote",
      website_booking_id: input.bookingId,
      job_position: job.position,
    };
    if (vehicleId) baseMetadata.vehicle_id = vehicleId;
    const sortBase = index * 10;

    const subtotal = roundMoney(Number(job.subtotal_usd) || 0);
    const waste = roundMoney(Number(job.waste_fee_usd) || 0);
    const processing = roundMoney(Number(job.processing_fee_usd) || 0);
    const tax = roundMoney(Number(job.tax_usd) || 0);
    const total = roundMoney(Number(job.total_usd) || 0);
    taxTotal += tax;

    const serviceItem: PerJobItemDraft = {
      item_type: "service",
      description: (job.service_name || "Website booking").slice(0, 250),
      quantity: 1,
      unit_price: subtotal,
      service_catalog_id: input.catalogIds[index] ?? null,
      sort_order: sortBase,
      metadata: { ...baseMetadata },
    };

    if (subtotal === 0 && waste === 0 && processing === 0 && tax === 0) {
      // Legacy job (or a genuinely free job): one lump service item at
      // the job total, exactly what the push wrote before per-job data.
      serviceItem.unit_price = total;
      items.push(serviceItem);
      serviceItemByJob.push(serviceItem);
      return;
    }

    items.push(serviceItem);
    serviceItemByJob.push(serviceItem);
    const fees: Array<{ amount: number; description: string; feeKey: string; offset: number }> = [
      { amount: waste, description: WASTE_FEE_DESCRIPTION, feeKey: WASTE_FEE_KEY, offset: 1 },
      { amount: processing, description: PROCESSING_FEE_DESCRIPTION, feeKey: PROCESSING_FEE_KEY, offset: 2 },
      { amount: tax, description: TAX_FEE_DESCRIPTION, feeKey: TAX_FEE_KEY, offset: 3 },
    ];
    for (const fee of fees) {
      if (fee.amount <= 0) continue;
      items.push({
        item_type: "fee",
        description: fee.description,
        quantity: 1,
        unit_price: fee.amount,
        service_catalog_id: null,
        sort_order: sortBase + fee.offset,
        metadata: { ...baseMetadata, fee_key: fee.feeKey },
      });
    }
  });

  const sum = roundMoney(items.reduce((acc, item) => acc + item.unit_price, 0));
  const residual = roundMoney(roundMoney(input.quotedTotalUsd) - sum);
  if (residual !== 0) {
    const lastService = [...serviceItemByJob].reverse().find((item) => item !== null) ?? null;
    if (lastService) {
      lastService.unit_price = roundMoney(lastService.unit_price + residual);
    }
  }

  return { items, taxTotalUsd: roundMoney(taxTotal), residualUsd: residual };
}
