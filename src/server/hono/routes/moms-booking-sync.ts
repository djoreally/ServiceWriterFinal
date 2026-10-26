import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { json } from "@/server/api";

export const momsBookingSyncRouter = new Hono();

const payloadSchema = z.object({
  sourceBookingId: z.string().uuid(),
  scheduledStart: z.string().datetime({ offset: true }),
  customer: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(10).max(64),
  }),
  vehicle: z.object({
    year: z.number().int().min(1900).max(2100),
    make: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    engine: z.string().trim().max(100).nullable().optional(),
    vin: z.string().trim().max(32).nullable().optional(),
    oilType: z.string().trim().max(100).nullable().optional(),
    oilCapacityQuarts: z.number().positive().max(100).nullable().optional(),
  }),
  address: z.object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(2).max(50),
    postalCode: z.string().trim().min(3).max(20),
  }),
  service: z.object({
    name: z.string().trim().min(1).max(200),
    priceCents: z.number().int().nonnegative(),
    durationMinutes: z.number().int().min(1).max(1440),
  }),
  totalCents: z.number().int().nonnegative(),
  notes: z.string().max(2000).nullable().optional(),
});

function validSignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature.slice(7), "hex"); } catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function idFrom(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.id === "string") return row.id;
    if (typeof row.appointment_id === "string") return row.appointment_id;
  }
  return null;
}

function localDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : "Service Writer booking sync failed";
}

momsBookingSyncRouter.post("/v1/integrations/moms/bookings", async (c: Context) => {
  const secret = process.env.MOMS_BOOKING_WEBHOOK_SECRET;
  if (!secret) return json({ error: { code: "integration_not_configured", message: "MOMS booking integration is not configured" } }, { status: 503 });

  const raw = await c.req.text();
  if (Buffer.byteLength(raw, "utf8") > 64 * 1024) return json({ error: { code: "payload_too_large", message: "Payload exceeds limit" } }, { status: 413 });
  if (!validSignature(raw, c.req.header("x-moms-signature") ?? null, secret)) {
    return json({ error: { code: "invalid_signature", message: "Invalid integration signature" } }, { status: 401 });
  }

  let parsedJson: unknown;
  try { parsedJson = JSON.parse(raw); }
  catch { return json({ error: { code: "invalid_json", message: "Invalid JSON body" } }, { status: 400 }); }
  const parsed = payloadSchema.safeParse(parsedJson);
  if (!parsed.success) return json({ error: { code: "invalid_payload", message: "Invalid booking payload", issues: parsed.error.issues } }, { status: 400 });

  const payload = parsed.data;
  const sourceMarker = `MOMS_SOURCE_BOOKING_ID=${payload.sourceBookingId}`;
  const admin = createSupabaseAdminClient() as any;
  let event: any = null;

  const inserted = await admin.from("moms_booking_sync_events").insert({
    source_booking_id: payload.sourceBookingId,
    status: "processing",
    payload,
    attempts: 1,
  }).select("*").maybeSingle();

  if (!inserted.error) {
    event = inserted.data;
  } else if (inserted.error.code === "23505") {
    const existing = await admin.from("moms_booking_sync_events").select("*").eq("source_booking_id", payload.sourceBookingId).maybeSingle();
    if (existing.error || !existing.data) return json({ error: { code: "sync_ledger_read_failed", message: "Could not read sync status" } }, { status: 503 });
    event = existing.data;
    if (event.status === "synced") return json({ ok: true, duplicate: true, appointmentId: event.appointment_id });
    if (event.status === "processing" && Date.now() - new Date(event.updated_at).getTime() < 5 * 60_000) {
      return json({ ok: true, accepted: true, inProgress: true, appointmentId: event.appointment_id ?? null }, { status: 202 });
    }
    const claimed = await admin.from("moms_booking_sync_events").update({
      status: "processing", attempts: Number(event.attempts ?? 0) + 1, last_error: null, payload, updated_at: new Date().toISOString(),
    }).eq("source_booking_id", payload.sourceBookingId).neq("status", "synced").select("*").maybeSingle();
    if (claimed.error || !claimed.data) return json({ error: { code: "sync_claim_failed", message: "Could not claim sync attempt" } }, { status: 409 });
    event = claimed.data;
  } else {
    return json({ error: { code: "sync_ledger_write_failed", message: "Could not create sync record" } }, { status: 503 });
  }

  try {
    const bookingSlug = "momsoilchange";
    let customerId = event.customer_id as string | null;
    let vehicleId = event.vehicle_id as string | null;
    let appointmentId = event.appointment_id as string | null;

    const customerResult = await admin.rpc("public_booking_upsert_customer", {
      p_booking_slug: bookingSlug,
      p_email: payload.customer.email,
      p_name: `${payload.customer.firstName} ${payload.customer.lastName}`,
      p_phone: payload.customer.phone,
      p_address: null,
    });
    if (customerResult.error) throw new Error(`customer_upsert_failed: ${customerResult.error.message}`);
    customerId = customerId ?? idFrom(customerResult.data);
    if (!customerId) throw new Error("customer_upsert_missing_id");

    if (!vehicleId) {
      const vehicleResult = await admin.rpc("public_booking_upsert_vehicle", {
        p_booking_slug: bookingSlug,
        p_customer_email: payload.customer.email,
        p_customer_phone: payload.customer.phone,
        p_year: payload.vehicle.year,
        p_make: payload.vehicle.make,
        p_model: payload.vehicle.model,
        p_license_plate: null,
        p_vin: payload.vehicle.vin ?? null,
        p_mileage: null,
        p_oil_type: payload.vehicle.oilType ?? null,
        p_oil_capacity: payload.vehicle.oilCapacityQuarts == null ? null : String(payload.vehicle.oilCapacityQuarts),
        p_image_url: null,
        p_engine: payload.vehicle.engine ?? null,
      });
      if (vehicleResult.error) throw new Error(`vehicle_upsert_failed: ${vehicleResult.error.message}`);
      vehicleId = idFrom(vehicleResult.data);
      if (!vehicleId) throw new Error("vehicle_upsert_missing_id");
      await admin.from("moms_booking_sync_events").update({ customer_id: customerId, vehicle_id: vehicleId, updated_at: new Date().toISOString() }).eq("source_booking_id", payload.sourceBookingId);
    }

    if (!appointmentId) {
      const existingAppointment = await admin.from("appointments").select("id").eq("workspace_id", "250c258f-fad6-46e1-86de-3de41a7d4e1a").ilike("notes", `%${sourceMarker}%`).limit(1).maybeSingle();
      if (existingAppointment.error) throw new Error(`appointment_idempotency_lookup_failed: ${existingAppointment.error.message}`);
      appointmentId = existingAppointment.data?.id ?? null;
    }

    if (!appointmentId) {
      const local = localDateTime(payload.scheduledStart);
      const appointmentResult = await admin.rpc("public_booking_book_appointment_v3", {
        p_booking_slug: bookingSlug,
        p_scheduled_date: local.date,
        p_scheduled_time: local.time,
        p_duration_minutes: payload.service.durationMinutes,
        p_title: `${payload.service.name} — ${payload.vehicle.year} ${payload.vehicle.make} ${payload.vehicle.model}`,
        p_guest_name: `${payload.customer.firstName} ${payload.customer.lastName}`,
        p_guest_email: payload.customer.email,
        p_guest_phone: payload.customer.phone,
        p_description: `${payload.service.name} for ${payload.vehicle.year} ${payload.vehicle.make} ${payload.vehicle.model}`,
        p_notes: [sourceMarker, payload.notes].filter(Boolean).join("\n"),
        p_estimated_cost: payload.totalCents / 100,
        p_tax_amount: 0,
        p_service_catalog_id: null,
        p_vehicle_id: vehicleId,
        p_location_address: [payload.address.line1, payload.address.line2, payload.address.city, payload.address.state, payload.address.postalCode].filter(Boolean).join(", "),
        p_location_lat: null,
        p_location_lng: null,
        p_status: "confirmed",
      });
      if (appointmentResult.error) throw new Error(`appointment_create_failed: ${appointmentResult.error.message}`);
      appointmentId = idFrom(appointmentResult.data);
      if (!appointmentId) throw new Error("appointment_create_missing_id");
      const saved = await admin.from("moms_booking_sync_events").update({ customer_id: customerId, vehicle_id: vehicleId, appointment_id: appointmentId, updated_at: new Date().toISOString() }).eq("source_booking_id", payload.sourceBookingId);
      if (saved.error) throw new Error(`appointment_link_save_failed: ${saved.error.message}`);
    }

    if (!event.service_lines_synced) {
      const serviceResult = await admin.rpc("public_booking_insert_services_v7", {
        p_booking_slug: bookingSlug,
        p_appointment_id: appointmentId,
        p_customer_email: payload.customer.email,
        p_customer_phone: payload.customer.phone,
        p_services: [{
          vehicle_id: vehicleId,
          service_catalog_id: null,
          name: payload.service.name,
          price: payload.service.priceCents / 100,
          quantity: 1,
          is_prepaid: false,
        }],
      });
      if (serviceResult.error) throw new Error(`service_lines_failed: ${serviceResult.error.message}`);
      const linesSaved = await admin.from("moms_booking_sync_events").update({ service_lines_synced: true, updated_at: new Date().toISOString() }).eq("source_booking_id", payload.sourceBookingId);
      if (linesSaved.error) throw new Error(`service_lines_state_save_failed: ${linesSaved.error.message}`);
    }

    const done = await admin.from("moms_booking_sync_events").update({
      status: "synced", appointment_id: appointmentId, customer_id: customerId, vehicle_id: vehicleId,
      last_error: null, synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("source_booking_id", payload.sourceBookingId);
    if (done.error) throw new Error(`sync_complete_state_save_failed: ${done.error.message}`);
    return json({ ok: true, duplicate: false, appointmentId });
  } catch (error) {
    await admin.from("moms_booking_sync_events").update({
      status: "failed", last_error: errorText(error), updated_at: new Date().toISOString(),
    }).eq("source_booking_id", payload.sourceBookingId);
    return json({ error: { code: "booking_sync_failed", message: "Service Writer could not finish syncing this booking" } }, { status: 503 });
  }
});
