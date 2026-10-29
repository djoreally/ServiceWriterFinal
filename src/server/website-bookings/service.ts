/**
 * Website Bookings queue — server logic for prepare (preview + checks) and
 * push (create via the canonical staff RPC, verify, stamp).
 *
 * Canonical-path discipline (spec §2): appointments are created ONLY through
 * public_booking_book_appointment_staff_v1, the authenticated staff variant
 * of public_booking_book_appointment_v3 delivered in
 * supabase/migrations/20261028235900_website_booking_staff_push_rpc.sql.
 * No direct inserts into appointments anywhere in this module, and no
 * customer-facing side effects: this module never calls the confirmation
 * endpoint or any messaging path.
 */
import {
  appointmentDescription,
  appointmentTitle,
  computeStoredTotal,
  findDuplicateCandidates,
  findOverlaps,
  isValidEmailLoose,
  localDateInTimezone,
  matchServiceCatalogId,
  phoneDigits,
  roundMoney,
  splitScheduledStart,
  staffNote,
  windowsOverlap,
  type AppointmentLite,
  type PushDecision,
  type PushPreview,
  type PushResult,
  type WebsiteBooking,
} from "@/lib/website-bookings";
import {
  fetchWebsiteBookings,
  getWebsiteBookingsConfig,
  setWebsiteBookingNeverPush,
  stampWebsiteBookingPushed,
  websiteIntegrationNotConfigured,
  WebsiteBackendError,
  type WebsiteBookingsConfig,
} from "./client";

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
  slug: string | null;
}

async function getWorkspaceContext(supabase: any, workspaceId: string): Promise<WorkspaceContext> {
  const [{ data: workspace }, { data: settings }] = await Promise.all([
    supabase.from("workspaces").select("timezone").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("booking_slug").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  return {
    timezone: (workspace?.timezone as string) || "UTC",
    slug: (settings?.booking_slug as string) || null,
  };
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
  if (!booking.vehicle) {
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
  const { data: catalog, error: catalogError } = await supabase
    .from("service_catalog")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);
  if (catalogError) throw catalogError;
  const catalogId = matchServiceCatalogId((catalog ?? []) as Array<{ id: string; name: string }>, booking.service);
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

export async function executePushes(
  supabase: any,
  workspaceId: string,
  decisions: PushDecision[],
): Promise<PushResult[]> {
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
    const resolution = await resolveBooking(supabase, workspaceId, booking, ctx);
    if (resolution.blocked_reason || !resolution.geocode || !resolution.service_match.catalog_id) {
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: null,
        message: resolution.blocked_reason ?? "Booking could not be resolved for push.",
      });
      continue;
    }

    const { data: appointmentId, error: rpcError } = await supabase.rpc("public_booking_book_appointment_staff_v1", {
      p_booking_slug: ctx.slug,
      p_scheduled_date: resolution.scheduled.date,
      p_scheduled_time: resolution.scheduled.time,
      p_duration_minutes: resolution.scheduled.duration_minutes,
      p_title: appointmentTitle(booking),
      p_guest_name: booking.customer,
      p_guest_email: booking.email,
      p_guest_phone: booking.phone,
      p_description: appointmentDescription(booking),
      p_notes: staffNote(booking),
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
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: null,
        message: rpcError.message || "The booking path rejected this push.",
      });
      continue;
    }

    const createdId = appointmentId as string;

    // Price lock verification (spec §6): the stored total must equal the
    // website quote to the cent, or the result is a failure — never a
    // silent success. The booking is deliberately NOT stamped on drift so
    // the discrepancy stays visible in the queue.
    const verification = await verifyStoredTotal(supabase, createdId, booking.quoted_total_usd);
    if (!verification.ok) {
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: createdId,
        message: `Price drift: appointment ${createdId} was created but its stored total is $${verification.stored.toFixed(2)}, not the website quote $${roundMoney(booking.quoted_total_usd).toFixed(2)}. The website booking was left unstamped so this stays visible.`,
      });
      continue;
    }

    try {
      await stampWebsiteBookingPushed(config, bookingId, createdId);
      results.push({
        booking_id: bookingId,
        status: "created",
        appointment_id: createdId,
        message: "Appointment created in Service Writer at the website quote.",
      });
    } catch (error) {
      results.push({
        booking_id: bookingId,
        status: "failed",
        appointment_id: createdId,
        message: `Appointment ${createdId} was created, but stamping the website booking failed: ${error instanceof Error ? error.message : "unknown error"}. Pushing again is safe — the booking path returns the same appointment instead of duplicating it.`,
      });
    }
  }

  return results;
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
