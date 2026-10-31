/**
 * Website Bookings queue — server logic for prepare (preview + checks) and
 * push (create via the canonical staff RPC, verify, stamp).
 *
 * Canonical-path discipline (spec §2): appointments are created ONLY through
 * public_booking_book_appointment_staff_v1, the authenticated staff variant
 * of public_booking_book_appointment_v3 delivered in
 * supabase/migrations/20261028235900_website_booking_staff_push_rpc.sql.
 * No direct inserts into appointments anywhere in this module. After the
 * RPC creates the appointment, its items are normalized to the booking's
 * per-job structure (one service item per vehicle/job at that job's own
 * price, fee items pinned per vehicle) by replacing exactly the items
 * the push itself owns. No customer-facing side effects: this module
 * never calls the confirmation
 * endpoint and never emails the customer (the website already did). The
 * one messaging side effect is deliberate and shop-side only: after a
 * push creates an appointment, the shop gets the same "new appointment
 * booked" notification the public booking path sends, so a website
 * booking is never silent to the shop.
 */
import {
  appointmentDescription,
  appointmentDescriptionForJobs,
  appointmentTitle,
  appointmentTitleForJobs,
  buildPerJobItems,
  computeStoredTotal,
  customerNotes,
  findDuplicateCandidates,
  findOverlaps,
  isValidEmailLoose,
  localDateInTimezone,
  phoneDigits,
  resolveBookingJobs,
  resolveServiceCatalogId,
  roundMoney,
  splitScheduledStart,
  windowsOverlap,
  type AppointmentLite,
  type AutoPushResult,
  type PushDecision,
  type PushPreview,
  type PushResult,
  type WebsiteBooking,
  type WebsiteBookingJob,
} from "@/lib/website-bookings";
import {
  fetchWebsiteBookings,
  getWebsiteBookingsConfig,
  recordWebsiteBookingAutoPushFailure,
  setWebsiteBookingNeverPush,
  stampWebsiteBookingPushed,
  websiteIntegrationNotConfigured,
  WebsiteBackendError,
  type WebsiteBookingsConfig,
} from "./client";
import { sendShopBookingNotification } from "@/server/messaging/booking-confirmation";

// Mirrors geocodeAddressServer in src/server/hono/routes/appointments.ts
// (Mapbox v5, same token env) so pushed appointments geocode identically to
// backfilled ones.
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const token = (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || "").trim();
  if (!token.startsWith("pk.") || token.length <= 20) {
    throw new Error("Mapbox is not configured on the server, so the address cannot be geocoded.");
  }
  const params = new URLSearchParams({ access_token: token, limit: "1" });
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?${params.toString()}`,
  );
  if (!res.ok) throw new Error(`Mapbox geocoding failed: ${res.statusText}`);
  const data = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
  const center = data?.features?.[0]?.center;
  if (!center) return null;
  return { lng: center[0], lat: center[1] };
}

interface WorkspaceContext {
  timezone: string;
  name: string;
  slug: string | null;
}

async function getWorkspaceContext(supabase: any, workspaceId: string): Promise<WorkspaceContext> {
  const [{ data: workspace }, { data: settings }] = await Promise.all([
    supabase.from("workspaces").select("timezone, name").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("booking_slug").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  return {
    timezone: (workspace?.timezone as string) || "UTC",
    name: (workspace?.name as string) || "Service Writer",
    slug: (settings?.booking_slug as string) || null,
  };
}

/**
 * Best-effort shop notification for a freshly pushed appointment: the
 * same "new appointment booked" email the public booking path sends to
 * booking_notification_emails plus the workspace owner. The website
 * already emailed the customer, so the customer is excluded. A failure
 * is logged and never changes the push result.
 */
async function notifyShopOfPushedBooking(
  supabase: any,
  ctx: WorkspaceContext,
  booking: WebsiteBooking,
  appointmentId: string,
): Promise<void> {
  try {
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id, workspace_id, customer_id, starts_at, ends_at, status, notes, metadata, confirmation_code")
      .eq("id", appointmentId)
      .maybeSingle();
    if (!appointment) return;
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://servicewriter.xyz").replace(/\/$/, "");
    await sendShopBookingNotification({
      appointment: {
        id: appointment.id,
        workspace_id: appointment.workspace_id,
        customer_id: appointment.customer_id,
        starts_at: appointment.starts_at,
        ends_at: appointment.ends_at,
        status: appointment.status,
        notes: appointment.notes,
        metadata: {
          ...((appointment.metadata as Record<string, unknown> | null) ?? {}),
          confirmation_code: appointment.confirmation_code ?? undefined,
        },
      },
      workspaceName: ctx.name,
      workspaceTimezone: ctx.timezone,
      actionUrl: appUrl,
      excludeEmail: booking.email,
    });
  } catch (error) {
    console.error(
      "[WebsiteBookings] shop booking notification failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

/** Fill scheduled_end from the start + duration when the backend omitted it. */
function normalizeWindow(booking: WebsiteBooking, timezone: string): WebsiteBooking {
  if (booking.scheduled_end) return booking;
  const { durationMinutes } = splitScheduledStart(booking.scheduled_start, null, timezone);
  const end = new Date(Date.parse(booking.scheduled_start) + durationMinutes * 60000).toISOString();
  return { ...booking, scheduled_end: end };
}

interface Resolution {
  blocked_reason: string | null;
  warnings: string[];
  customer_match: PushPreview["customer_match"];
  service_match: PushPreview["service_match"];
  /** Catalog id per booking job (aligned with `resolveBookingJobs`
   * order); entry 0 is the first job and mirrors `service_match`. Only
   * set on the fully-resolved (unblocked) return. */
  job_catalog_ids?: Array<string | null>;
  geocode: { lat: number; lng: number } | null;
  scheduled: PushPreview["scheduled"];
  duplicate_candidates: PushPreview["duplicate_candidates"];
  overlaps: PushPreview["overlaps"];
}

async function fetchDayAppointments(
  supabase: any,
  workspaceId: string,
  booking: WebsiteBooking,
  timezone: string,
): Promise<AppointmentLite[]> {
  const startMs = Date.parse(booking.scheduled_start);
  const from = new Date(startMs - 36 * 3600_000).toISOString();
  const to = new Date(startMs + 36 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .select("id,customer_id,vehicle_id,starts_at,ends_at,status,metadata,vehicles(year,make,model)")
    .eq("workspace_id", workspaceId)
    .gte("starts_at", from)
    .lte("starts_at", to);
  if (error) throw error;
  const bookingDate = localDateInTimezone(booking.scheduled_start, timezone);
  return ((data ?? []) as any[])
    .map((row) => ({
      id: row.id as string,
      customer_id: (row.customer_id as string) ?? null,
      vehicle_id: (row.vehicle_id as string) ?? null,
      starts_at: row.starts_at as string,
      ends_at: row.ends_at as string,
      status: row.status as string,
      guest_phone: (row.metadata?.guest_phone as string) ?? null,
      title: (row.metadata?.title as string) ?? null,
      vehicle: row.vehicles
        ? { year: Number(row.vehicles.year), make: String(row.vehicles.make), model: String(row.vehicles.model) }
        : null,
      local_date: localDateInTimezone(row.starts_at as string, timezone),
    }))
    .filter((row) => row.local_date === bookingDate || windowsOverlap(booking.scheduled_start, booking.scheduled_end ?? booking.scheduled_start, row.starts_at, row.ends_at))
    .map(({ local_date: _localDate, ...rest }) => rest as AppointmentLite);
}

async function resolveBooking(
  supabase: any,
  workspaceId: string,
  booking: WebsiteBooking,
  ctx: WorkspaceContext,
): Promise<Resolution> {
  const warnings: string[] = [];
  const scheduled = splitScheduledStart(booking.scheduled_start, booking.scheduled_end, ctx.timezone);
  const scheduledOut = { date: scheduled.date, time: scheduled.time, duration_minutes: scheduled.durationMinutes };

  if (!ctx.slug) {
    return {
      blocked_reason: "This workspace has no booking slug configured, so the canonical booking path cannot resolve it.",
      warnings,
      customer_match: { kind: "new", customer_id: null, label: "New customer" },
      service_match: { catalog_id: null, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }
  if (!booking.email || !isValidEmailLoose(booking.email)) {
    return {
      blocked_reason: `The website booking's email ("${booking.email ?? "none"}") is not usable — the booking path requires a valid email. Fix it on the website side or skip this booking.`,
      warnings,
      customer_match: { kind: "new", customer_id: null, label: "New customer" },
      service_match: { catalog_id: null, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }
  if (phoneDigits(booking.phone).length < 10) {
    return {
      blocked_reason: `The website booking's phone ("${booking.phone ?? "none"}") has fewer than 10 digits — the booking path requires a full phone number.`,
      warnings,
      customer_match: { kind: "new", customer_id: null, label: "New customer" },
      service_match: { catalog_id: null, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }
  if (!booking.service) {
    return {
      blocked_reason: "The website booking has no service recorded, so no appointment can be created for it.",
      warnings,
      customer_match: { kind: "new", customer_id: null, label: "New customer" },
      service_match: { catalog_id: null, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }
  if (!booking.vehicle || !booking.vehicle.year || !booking.vehicle.make || !booking.vehicle.model) {
    return {
      blocked_reason: "The website booking has no vehicle recorded, so no appointment can be created for it.",
      warnings,
      customer_match: { kind: "new", customer_id: null, label: "New customer" },
      service_match: { catalog_id: null, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }

  // Customer preview match: email first (exact, case-insensitive), then the
  // common stored phone formats. The staff RPC re-checks authoritatively
  // (phone right-10, then email) at create time.
  let customerMatch: PushPreview["customer_match"] = { kind: "new", customer_id: null, label: "New customer" };
  const { data: byEmail } = await supabase
    .from("customers")
    .select("id,first_name,last_name,email")
    .eq("workspace_id", workspaceId)
    .ilike("email", booking.email)
    .order("created_at")
    .limit(1);
  let matched = (byEmail ?? [])[0] as { id: string; first_name?: string; last_name?: string } | undefined;
  if (!matched) {
    const digits = phoneDigits(booking.phone);
    const variants = Array.from(new Set([digits, `+${digits}`, digits.length === 10 ? `+1${digits}` : digits]));
    const { data: byPhone } = await supabase
      .from("customers")
      .select("id,first_name,last_name,email")
      .eq("workspace_id", workspaceId)
      .in("phone", variants)
      .order("created_at")
      .limit(1);
    matched = (byPhone ?? [])[0];
  }
  if (matched) {
    const name = `${matched.first_name ?? ""} ${matched.last_name ?? ""}`.trim();
    customerMatch = { kind: "existing", customer_id: matched.id, label: name || "Existing customer" };
  }

  // Service resolution (spec §4): unresolvable service blocks the push.
  // The catalog is loaded scoped to THIS workspace's active services, so a
  // backend-supplied serviceCatalogId can only resolve inside the workspace.
  const { data: catalog, error: catalogError } = await supabase
    .from("service_catalog")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);
  if (catalogError) throw catalogError;
  const catalogRows = (catalog ?? []) as Array<{ id: string; name: string }>;
  const jobs = resolveBookingJobs(booking);
  const catalogId = resolveServiceCatalogId(catalogRows, booking.service, jobs[0]?.serviceCatalogId);
  if (!catalogId) {
    return {
      blocked_reason: `Service "${booking.service}" does not match any active Service Writer catalog service in this workspace. Add or rename the catalog service, or skip this booking.`,
      warnings,
      customer_match: customerMatch,
      service_match: { catalog_id: null, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }

  // Per-job service resolution: every job on the booking must resolve to
  // a catalog service, or the push cannot build that vehicle's items
  // (same spec §4 rule as the first job, applied per job). Each job prefers
  // its backend-supplied serviceCatalogId (exact catalog record) and falls
  // back to name matching.
  const jobCatalogIds: Array<string | null> = jobs.map((job, index) =>
    index === 0
      ? catalogId
      : resolveServiceCatalogId(catalogRows, job.service_name, job.serviceCatalogId),
  );
  const unmatchedJob = jobs.find((job, index) => jobCatalogIds[index] === null);
  if (unmatchedJob) {
    return {
      blocked_reason: `Service "${unmatchedJob.service_name}" (job ${unmatchedJob.position + 1} of this booking) does not match any active Service Writer catalog service in this workspace. Add or rename the catalog service, or skip this booking.`,
      warnings,
      customer_match: customerMatch,
      service_match: { catalog_id: catalogId, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }

  // Geocode (spec §4): no coordinates, no push — never create without a
  // location.
  let geocode: { lat: number; lng: number } | null = null;
  try {
    geocode = await geocodeAddress(booking.address);
  } catch (error) {
    return {
      blocked_reason: error instanceof Error ? error.message : "Address could not be geocoded.",
      warnings,
      customer_match: customerMatch,
      service_match: { catalog_id: catalogId, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }
  if (!geocode) {
    return {
      blocked_reason: `Address could not be geocoded: "${booking.address}". Fix the address on the website side or skip this booking.`,
      warnings,
      customer_match: customerMatch,
      service_match: { catalog_id: catalogId, name: booking.service },
      geocode: null,
      scheduled: scheduledOut,
      duplicate_candidates: [],
      overlaps: [],
    };
  }

  const dayAppointments = await fetchDayAppointments(supabase, workspaceId, booking, ctx.timezone);
  const duplicates = findDuplicateCandidates(booking, dayAppointments, customerMatch.customer_id);
  const overlaps = findOverlaps(booking, dayAppointments, new Set(duplicates.map((d) => d.appointment_id)));

  return {
    blocked_reason: null,
    warnings,
    customer_match: customerMatch,
    service_match: { catalog_id: catalogId, name: booking.service },
    job_catalog_ids: jobCatalogIds,
    geocode,
    scheduled: scheduledOut,
    duplicate_candidates: duplicates,
    overlaps,
  };
}

function requireConfig(): WebsiteBookingsConfig {
  const config = getWebsiteBookingsConfig();
  if (!config) throw websiteIntegrationNotConfigured();
  return config;
}

export async function listWebsiteBookingsQueue(
  status: "unpushed" | "never_push" | "pushed",
): Promise<WebsiteBooking[]> {
  const config = requireConfig();
  return fetchWebsiteBookings(config, status);
}

export async function preparePushes(
  supabase: any,
  workspaceId: string,
  bookingIds: string[],
): Promise<{ previews: PushPreview[]; not_found: string[] }> {
  const config = requireConfig();
  const ctx = await getWorkspaceContext(supabase, workspaceId);
  const unpushed = await fetchWebsiteBookings(config, "unpushed");
  const byId = new Map(unpushed.map((b) => [b.id, normalizeWindow(b, ctx.timezone)]));

  const previews: PushPreview[] = [];
  const notFound: string[] = [];
  for (const id of bookingIds) {
    const booking = byId.get(id);
    if (!booking) {
      notFound.push(id);
      continue;
    }
    const resolution = await resolveBooking(supabase, workspaceId, booking, ctx);
    previews.push({
      booking,
      blocked_reason: resolution.blocked_reason,
      warnings: resolution.warnings,
      customer_match: resolution.customer_match,
      service_match: resolution.service_match,
      geocode: resolution.geocode,
      scheduled: resolution.scheduled,
      duplicate_candidates: resolution.duplicate_candidates,
      overlaps: resolution.overlaps,
      batch_overlap_booking_ids: [],
    });
  }

  // Batch-internal overlaps (spec §7B): two selected website bookings in the
  // same window flag each other.
  for (let i = 0; i < previews.length; i++) {
    for (let j = i + 1; j < previews.length; j++) {
      const a = previews[i].booking;
      const b = previews[j].booking;
      if (
        windowsOverlap(
          a.scheduled_start,
          a.scheduled_end ?? a.scheduled_start,
          b.scheduled_start,
          b.scheduled_end ?? b.scheduled_start,
        )
      ) {
        previews[i].batch_overlap_booking_ids.push(b.id);
        previews[j].batch_overlap_booking_ids.push(a.id);
      }
    }
  }

  return { previews, not_found: notFound };
}

async function verifyStoredTotal(
  supabase: any,
  appointmentId: string,
  quotedTotal: number,
): Promise<{ ok: boolean; stored: number }> {
  const [{ data: appointment }, { data: items }] = await Promise.all([
    supabase.from("appointments").select("metadata").eq("id", appointmentId).maybeSingle(),
    supabase.from("appointment_items").select("quantity,unit_price").eq("appointment_id", appointmentId),
  ]);
  const stored = computeStoredTotal(
    (appointment?.metadata as Record<string, unknown>) ?? null,
    (items ?? []) as Array<{ quantity: unknown; unit_price: unknown }>,
  );
  return { ok: stored === roundMoney(quotedTotal), stored };
}

interface VehicleRow {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}

/** VIN comparison key, mirroring upsert_booking_vehicle's normalization. */
function normalizeVin(value: string | null | undefined): string | null {
  const vin = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return vin.length > 0 ? vin : null;
}

/**
 * Match a job's vehicle against the customer's Service Writer vehicles:
 * VIN first (when the feed carries one), then year/make/model, with the
 * specs engine breaking ties when the job names an engine.
 */
function matchJobVehicle(
  job: WebsiteBookingJob,
  vehicles: VehicleRow[],
  specEngineByVehicle: Map<string, string | null>,
): string | null {
  const wanted = job.vehicle;
  if (!wanted) return null;
  const vin = normalizeVin(wanted.vin);
  if (vin) {
    const byVin = vehicles.find((v) => normalizeVin(v.vin) === vin);
    if (byVin) return byVin.id;
  }
  const ci = (a: unknown, b: unknown) =>
    String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  const yearMakeModel = vehicles.filter(
    (v) => v.year === wanted.year && ci(v.make, wanted.make) && ci(v.model, wanted.model),
  );
  if (yearMakeModel.length === 0) return null;
  if (wanted.engine) {
    const withEngine = yearMakeModel.find((v) => {
      const engine = specEngineByVehicle.get(v.id);
      return engine ? ci(engine, wanted.engine) : false;
    });
    if (withEngine) return withEngine.id;
  }
  return yearMakeModel[0].id;
}

/**
 * Ensure a vehicle_service_specs row exists for the vehicle (the push
 * RPC writes one for the first job's vehicle only). Never overwrites
 * existing spec values — a staff-entered oil type/capacity survives;
 * only a missing engine is filled from the feed. Oil capacity is not in
 * the feed, so it stays null on rows the push creates.
 */
async function ensureVehicleSpecs(
  supabase: any,
  workspaceId: string,
  vehicleId: string,
  engine: string | null,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("vehicle_service_specs")
    .select("vehicle_id,engine")
    .eq("workspace_id", workspaceId)
    .eq("vehicle_id", vehicleId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) {
    const { error: insertError } = await supabase.from("vehicle_service_specs").insert({
      workspace_id: workspaceId,
      vehicle_id: vehicleId,
      engine: engine ?? null,
      oil_type: null,
      oil_capacity: null,
      oil_filter: null,
      source: "website_push",
      metadata: {},
    });
    if (insertError) throw insertError;
    return;
  }
  if (!existing.engine && engine) {
    const { error: updateError } = await supabase
      .from("vehicle_service_specs")
      .update({ engine })
      .eq("workspace_id", workspaceId)
      .eq("vehicle_id", vehicleId);
    if (updateError) throw updateError;
  }
}

/**
 * Reshape a freshly pushed appointment's items to the booking's per-job
 * structure. The booking RPC created the appointment canonically with a
 * single item at the quote; this replaces exactly the items that push
 * owns (metadata markers: source 'website_push' + this booking's id)
 * with one service item per job at that job's own price plus per-vehicle
 * fee items, each pinned to the job's vehicle — the same structure a
 * native multi-vehicle appointment carries. Staff-added items (any
 * other source) are never touched.
 *
 * Idempotent: a re-push (the RPC returns the same appointment) deletes
 * the previously normalized set and rebuilds it deterministically, so
 * the appointment always converges to the same item set.
 */
async function normalizePushedAppointmentItems(
  supabase: any,
  workspaceId: string,
  booking: WebsiteBooking,
  appointmentId: string,
  resolution: Resolution,
): Promise<{ taxTotalUsd: number; residualUsd: number }> {
  const jobs = resolveBookingJobs(booking);

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id,customer_id,vehicle_id,metadata")
    .eq("id", appointmentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (appointmentError) throw appointmentError;
  if (!appointment) throw new Error(`Appointment ${appointmentId} was not found after creation.`);
  const customerId = (appointment.customer_id as string | null) ?? null;
  if (!customerId) throw new Error(`Appointment ${appointmentId} has no customer to attach vehicles to.`);

  const { data: vehicleRows, error: vehiclesError } = await supabase
    .from("vehicles")
    .select("id,vin,year,make,model")
    .eq("workspace_id", workspaceId)
    .eq("customer_id", customerId);
  if (vehiclesError) throw vehiclesError;
  const vehicles: VehicleRow[] = [...((vehicleRows ?? []) as VehicleRow[])];

  const specEngineByVehicle = new Map<string, string | null>();
  if (vehicles.length > 0) {
    const { data: specRows, error: specsError } = await supabase
      .from("vehicle_service_specs")
      .select("vehicle_id,engine")
      .eq("workspace_id", workspaceId)
      .in("vehicle_id", vehicles.map((v) => v.id));
    if (specsError) throw specsError;
    for (const row of (specRows ?? []) as Array<{ vehicle_id: string; engine: string | null }>) {
      specEngineByVehicle.set(row.vehicle_id, row.engine ?? null);
    }
  }

  const vehicleIds: Array<string | null> = [];
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index];
    let vehicleId: string | null = null;
    if (index === 0 && appointment.vehicle_id && vehicles.some((v) => v.id === appointment.vehicle_id)) {
      // Job 1's vehicle was resolved authoritatively by the booking RPC
      // (it is the appointment's vehicle) — reuse it, never duplicate.
      vehicleId = appointment.vehicle_id as string;
    } else if (job.vehicle) {
      vehicleId = matchJobVehicle(job, vehicles, specEngineByVehicle);
      if (!vehicleId) {
        const { data: created, error: createError } = await supabase
          .from("vehicles")
          .insert({
            workspace_id: workspaceId,
            customer_id: customerId,
            vin: normalizeVin(job.vehicle.vin),
            year: job.vehicle.year,
            make: job.vehicle.make,
            model: job.vehicle.model,
            metadata: { source: "website_push" },
          })
          .select("id")
          .single();
        if (createError) throw createError;
        vehicleId = (created as { id: string }).id;
        vehicles.push({
          id: vehicleId,
          vin: normalizeVin(job.vehicle.vin),
          year: job.vehicle.year,
          make: job.vehicle.make,
          model: job.vehicle.model,
        });
      }
    }
    if (vehicleId) {
      await ensureVehicleSpecs(supabase, workspaceId, vehicleId, job.vehicle?.engine ?? null);
      if (job.vehicle?.engine && !specEngineByVehicle.get(vehicleId)) {
        specEngineByVehicle.set(vehicleId, job.vehicle.engine);
      }
    }
    vehicleIds.push(vehicleId);
  }

  const catalogIds = jobs.map(
    (_, index) => resolution.job_catalog_ids?.[index] ?? (index === 0 ? resolution.service_match.catalog_id : null),
  );
  const { items, taxTotalUsd, residualUsd } = buildPerJobItems({
    bookingId: booking.id,
    quotedTotalUsd: booking.quoted_total_usd,
    jobs,
    vehicleIds,
    catalogIds,
  });

  const { data: existingItems, error: itemsError } = await supabase
    .from("appointment_items")
    .select("id,metadata")
    .eq("workspace_id", workspaceId)
    .eq("appointment_id", appointmentId);
  if (itemsError) throw itemsError;
  const managedIds = ((existingItems ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>)
    .filter((item) => item.metadata?.source === "website_push" && item.metadata?.website_booking_id === booking.id)
    .map((item) => item.id);
  if (managedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("appointment_items")
      .delete()
      .eq("workspace_id", workspaceId)
      .in("id", managedIds);
    if (deleteError) throw deleteError;
  }
  if (items.length > 0) {
    const { error: insertError } = await supabase.from("appointment_items").insert(
      items.map((draft) => ({
        workspace_id: workspaceId,
        appointment_id: appointmentId,
        service_catalog_id: draft.service_catalog_id,
        item_type: draft.item_type,
        description: draft.description,
        quantity: draft.quantity,
        unit_price: draft.unit_price,
        is_prepaid: false,
        sort_order: draft.sort_order,
        metadata: draft.metadata,
      })),
    );
    if (insertError) throw insertError;
  }

  // Appointment metadata: name every job's vehicle in the title /
  // description, and record the booking's total tax at the canonical
  // tax_amount key. NOTE: under the current price lock
  // (20261029130000), the invoice sync re-runs on this metadata write
  // and pins tax_amount back to 0 — while tax rides as per-job Tax
  // items, the sync treats the quote as tax-inclusive. Making the
  // figure persist (and land in invoice tax_total) is the sync change
  // assessed separately; the write here keeps the value stated at the
  // canonical key for that change to pick up.
  const mergedMetadata = {
    ...((appointment.metadata as Record<string, unknown> | null) ?? {}),
    title: appointmentTitleForJobs(booking, jobs),
    description: appointmentDescriptionForJobs(booking, jobs),
    tax_amount: taxTotalUsd.toFixed(2),
  };
  const { error: metadataError } = await supabase
    .from("appointments")
    .update({ metadata: mergedMetadata })
    .eq("id", appointmentId)
    .eq("workspace_id", workspaceId);
  if (metadataError) throw metadataError;

  return { taxTotalUsd, residualUsd };
}

export interface ExecutePushesOptions {
  /**
   * "manual" (default): the staff queue — a human confirmed each push,
   * duplicates are the human's choice (link / push anyway / skip).
   * "auto_prepaid": the prepaid auto-push — same pipeline, same canonical
   * create, same quote verification, but the create runs through the
   * service-role RPC variant, a same-job duplicate resolves as Link
   * (never a twin), and every failure is recorded on the website booking
   * so the reason is staff-visible in the queue. Only prepaid,
   * non-cancelled bookings may be pushed in this mode; the guards below
   * enforce that inside the pipeline, not just at trigger time.
   */
  mode?: "manual" | "auto_prepaid";
}

/** Best-effort failure record for the auto-push path: the manual queue
 * (booking left unstamped) is the fail-safe; this just attaches the why. */
async function recordAutoPushFailureBestEffort(
  config: WebsiteBookingsConfig,
  bookingId: string,
  reason: string,
): Promise<void> {
  try {
    await recordWebsiteBookingAutoPushFailure(config, bookingId, reason);
  } catch {
    // Recording must never mask the pipeline's own result.
  }
}

export async function executePushes(
  supabase: any,
  workspaceId: string,
  decisions: PushDecision[],
  options: ExecutePushesOptions = {},
): Promise<PushResult[]> {
  const auto = options.mode === "auto_prepaid";
  const config = requireConfig();
  const ctx = await getWorkspaceContext(supabase, workspaceId);
  const results: PushResult[] = [];

  for (const decision of decisions) {
    const bookingId = decision.booking_id;
    if (decision.action === "skip" || decision.action === "hold") {
      results.push({
        booking_id: bookingId,
        status: "skipped",
        appointment_id: null,
        message: decision.action === "hold" ? "Held in the queue at your direction." : "Skipped at your direction.",
      });
      continue;
    }

    if (decision.action === "link") {
      const linkId = decision.link_appointment_id;
      if (!linkId) {
        results.push({ booking_id: bookingId, status: "failed", appointment_id: null, message: "Link chosen but no existing appointment was selected." });
        continue;
      }
      const { data: existing, error: existingError } = await supabase
        .from("appointments")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", linkId)
        .maybeSingle();
      if (existingError) {
        results.push({ booking_id: bookingId, status: "failed", appointment_id: null, message: existingError.message });
        continue;
      }
      if (!existing) {
        results.push({ booking_id: bookingId, status: "failed", appointment_id: null, message: "The appointment to link was not found in this workspace." });
        continue;
      }
      try {
        await stampWebsiteBookingPushed(config, bookingId, linkId);
        results.push({
          booking_id: bookingId,
          status: "linked",
          appointment_id: linkId,
          message: "Linked to the existing Service Writer appointment. Nothing new was created.",
        });
      } catch (error) {
        results.push({
          booking_id: bookingId,
          status: "failed",
          appointment_id: null,
          message: error instanceof Error ? error.message : "Failed to stamp the website booking.",
        });
      }
      continue;
    }

    // action === "push": re-read the booking fresh so a stale queue can
    // never double-create (the staff RPC is also idempotent per booking).
    let booking: WebsiteBooking | undefined;
    try {
      const unpushed = await fetchWebsiteBookings(config, "unpushed");
      booking = unpushed.find((b) => b.id === bookingId);
      if (!booking) {
        const pushed = await fetchWebsiteBookings(config, "pushed");
        const already = pushed.find((b) => b.id === bookingId);
        results.push({
          booking_id: bookingId,
          status: "failed",
          appointment_id: already?.pushed_sw_appointment_id ?? null,
          message: already
            ? `Already pushed as appointment ${already.pushed_sw_appointment_id}.`
            : "Booking is no longer in the unpushed queue (already pushed, marked never-push, or cancelled on the website).",
        });
        continue;
      }
    } catch (error) {
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: null,
        message: error instanceof Error ? error.message : "Could not read the website queue.",
      });
      continue;
    }

    booking = normalizeWindow(booking, ctx.timezone);

    if (auto) {
      // Guard inside the pipeline (not just at trigger time): the
      // booking is re-read fresh above, so a booking cancelled between
      // the trigger and this execution must not be pushed. Payment
      // status is NOT a gate here (Ty's ruling, 2026-10-30): the
      // automatic path pushes every website booking — prepaid and
      // pay-at-appointment alike. The backend only calls this path at
      // its two decision points (payment succeeded, or pay-at-
      // appointment chosen); payment itself is handled at the payment
      // level, never by this pipeline.
      if (booking.status === "cancelled") {
        const message = "Booking was cancelled on the website before the auto-push ran, so nothing was pushed.";
        await recordAutoPushFailureBestEffort(config, bookingId, message);
        results.push({ booking_id: bookingId, status: "failed", appointment_id: null, message });
        continue;
      }
    }

    const resolution = await resolveBooking(supabase, workspaceId, booking, ctx);
    if (resolution.blocked_reason || !resolution.geocode || !resolution.service_match.catalog_id) {
      const message = resolution.blocked_reason ?? "Booking could not be resolved for push.";
      if (auto) await recordAutoPushFailureBestEffort(config, bookingId, message);
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: null,
        message,
      });
      continue;
    }

    if (auto && resolution.duplicate_candidates.length > 0) {
      // Spec §7A, automatic edition: the same job already exists in
      // Service Writer, so Link — stamp against the existing appointment
      // and create nothing. (The manual flow leaves this choice to staff;
      // the automatic flow has no one to ask, and a twin is never right.)
      const linkId = resolution.duplicate_candidates[0].appointment_id;
      try {
        await stampWebsiteBookingPushed(config, bookingId, linkId);
        results.push({
          booking_id: bookingId,
          status: "linked",
          appointment_id: linkId,
          message: "Linked to the existing Service Writer appointment for the same job. Nothing new was created.",
        });
      } catch (error) {
        const message = `Failed to stamp the website booking as linked: ${error instanceof Error ? error.message : "unknown error"}`;
        await recordAutoPushFailureBestEffort(config, bookingId, message);
        results.push({ booking_id: bookingId, status: "failed", appointment_id: null, message });
      }
      continue;
    }

    const { data: appointmentId, error: rpcError } = await supabase.rpc(
      auto ? "public_booking_book_appointment_auto_v1" : "public_booking_book_appointment_staff_v1",
      {
      p_booking_slug: ctx.slug,
      p_scheduled_date: resolution.scheduled.date,
      p_scheduled_time: resolution.scheduled.time,
      p_duration_minutes: resolution.scheduled.duration_minutes,
      p_title: appointmentTitle(booking),
      p_guest_name: booking.customer,
      p_guest_email: booking.email,
      p_guest_phone: booking.phone,
      p_description: appointmentDescription(booking),
      // Notes are the customer's words only (Ty's standing rule): what
      // they typed on the website, or nothing. Provenance rides in the
      // RPC's own params below (p_website_booking_id / p_source_channel /
      // p_payment_status), which the RPC stores in appointment metadata.
      p_notes: customerNotes(booking),
      p_quoted_total: booking.quoted_total_usd,
      p_service_catalog_id: resolution.service_match.catalog_id,
      p_service_name: booking.service,
      p_vehicle_year: booking.vehicle?.year,
      p_vehicle_make: booking.vehicle?.make,
      p_vehicle_model: booking.vehicle?.model,
      p_vehicle_engine: booking.vehicle?.engine ?? null,
      p_location_address: booking.address,
      p_location_lat: resolution.geocode.lat,
      p_location_lng: resolution.geocode.lng,
      p_status: "confirmed",
      // Staff-confirmed push: the website promised this window, and the
      // owner saw every lead-time / overlap flag on the confirm screen
      // before confirming (spec §7B/§7C).
      p_override_availability: true,
      p_website_booking_id: booking.id,
      p_source_channel: booking.source_channel,
      p_payment_status: booking.payment,
    });
    if (rpcError) {
      const message = rpcError.message || "The booking path rejected this push.";
      if (auto) await recordAutoPushFailureBestEffort(config, bookingId, message);
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: null,
        message,
      });
      continue;
    }

    const createdId = appointmentId as string;

    // Per-job normalization: the RPC created the appointment through the
    // canonical single-vehicle path (one item at the quote). Reshape its
    // items to the per-vehicle structure the booking actually carries —
    // one service item per job at that job's price, fee items pinned per
    // vehicle. Failure leaves the booking unstamped, like price drift.
    let normalization: { taxTotalUsd: number; residualUsd: number };
    try {
      normalization = await normalizePushedAppointmentItems(supabase, workspaceId, booking, createdId, resolution);
    } catch (error) {
      const message = `Appointment ${createdId} was created, but reshaping its items per vehicle failed: ${error instanceof Error ? error.message : "unknown error"}. The website booking was left unstamped so this stays visible.`;
      if (auto) await recordAutoPushFailureBestEffort(config, bookingId, message);
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: createdId,
        message,
      });
      continue;
    }

    // Price lock verification (spec §6): the stored total must equal the
    // website quote to the cent, or the result is a failure — never a
    // silent success. The booking is deliberately NOT stamped on drift so
    // the discrepancy stays visible in the queue.
    const verification = await verifyStoredTotal(supabase, createdId, booking.quoted_total_usd);
    if (!verification.ok) {
      const message = `Price drift: appointment ${createdId} was created but its stored total is $${verification.stored.toFixed(2)}, not the website quote $${roundMoney(booking.quoted_total_usd).toFixed(2)}. The website booking was left unstamped so this stays visible.`;
      if (auto) await recordAutoPushFailureBestEffort(config, bookingId, message);
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: createdId,
        message,
      });
      continue;
    }

    try {
      await stampWebsiteBookingPushed(config, bookingId, createdId);
      await notifyShopOfPushedBooking(supabase, ctx, booking, createdId);
      results.push({
        booking_id: bookingId,
        status: "created",
        appointment_id: createdId,
        message:
          normalization.residualUsd !== 0
            ? `Appointment created in Service Writer at the website quote. A rounding residual of $${normalization.residualUsd.toFixed(2)} was applied to the last service item so the items total the quote exactly.`
            : "Appointment created in Service Writer at the website quote.",
      });
    } catch (error) {
      const message = `Appointment ${createdId} was created, but stamping the website booking failed: ${error instanceof Error ? error.message : "unknown error"}. Pushing again is safe — the booking path returns the same appointment instead of duplicating it.`;
      if (auto) await recordAutoPushFailureBestEffort(config, bookingId, message);
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: createdId,
        message,
      });
    }
  }

  return results;
}

/**
 * In-flight auto-push attempts, by website booking id. Stripe webhooks
 * retry and handlers double-fire; when a second trigger for the same
 * booking arrives while the first is still running in this process, it
 * joins the same attempt instead of starting a second one. Cross-process
 * protection is layered underneath: the backend's atomic claim, the
 * one-push-ever stamp, and the RPC's per-booking idempotency.
 */
const autoPushInFlight = new Map<string, Promise<AutoPushResult>>();

/**
 * Push ONE website booking automatically — prepaid or pay-at-appointment
 * (Ty, 2026-10-29; extended to every booking 2026-10-30).
 * This is the manual pipeline (`executePushes`) in `auto_prepaid` mode —
 * same prepare/resolve checks, same canonical create (service-role RPC
 * variant), same stored-total re-verification, same stamp. A booking
 * that is already stamped returns `already_pushed` and creates nothing.
 */
export function executeAutoPush(
  supabase: any,
  workspaceId: string,
  bookingId: string,
): Promise<AutoPushResult> {
  const inFlight = autoPushInFlight.get(bookingId);
  if (inFlight) return inFlight;
  const attempt = (async (): Promise<AutoPushResult> => {
    const config = requireConfig();
    const pushed = await fetchWebsiteBookings(config, "pushed");
    const already = pushed.find((b) => b.id === bookingId);
    if (already?.pushed_sw_appointment_id) {
      return {
        booking_id: bookingId,
        status: "already_pushed",
        appointment_id: already.pushed_sw_appointment_id,
        message: `Already pushed as appointment ${already.pushed_sw_appointment_id}.`,
      };
    }
    const [result] = await executePushes(supabase, workspaceId, [{ booking_id: bookingId, action: "push" }], {
      mode: "auto_prepaid",
    });
    if (!result) {
      return { booking_id: bookingId, status: "failed", appointment_id: null, message: "Auto-push produced no result." };
    }
    if (result.status === "created" || result.status === "linked") {
      return { booking_id: bookingId, status: result.status, appointment_id: result.appointment_id, message: result.message };
    }
    // executePushes reports an already-pushed race as a failed result
    // carrying the existing appointment id; translate it honestly.
    if (result.appointment_id && result.message.startsWith("Already pushed")) {
      return { booking_id: bookingId, status: "already_pushed", appointment_id: result.appointment_id, message: result.message };
    }
    return { booking_id: bookingId, status: "failed", appointment_id: result.appointment_id, message: result.message };
  })();
  autoPushInFlight.set(bookingId, attempt);
  // Clean up as the attempt settles. Registered before any caller can
  // await the attempt, so a later (non-concurrent) trigger never joins a
  // completed attempt — it re-enters and sees the pushed stamp instead.
  const cleanup = () => {
    if (autoPushInFlight.get(bookingId) === attempt) autoPushInFlight.delete(bookingId);
  };
  attempt.then(cleanup, cleanup);
  return attempt;
}

export async function setNeverPush(bookingId: string, neverPush: boolean): Promise<void> {
  const config = requireConfig();
  try {
    await setWebsiteBookingNeverPush(config, bookingId, neverPush);
  } catch (error) {
    if (error instanceof WebsiteBackendError) throw error;
    throw error;
  }
}
