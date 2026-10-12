import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { json } from "@/server/api";
import { createSupabaseAnonServerClient } from "@/lib/supabase";

export const publicBookingRouter = new Hono();

const publicBookingAppointmentSchema = z.object({
  p_booking_slug: z.string().trim().min(1).max(160),
  p_scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  p_scheduled_time: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  p_duration_minutes: z.number().int().min(1).max(1440),
  p_title: z.string().max(500),
  p_guest_name: z.string().trim().min(1).max(160),
  p_guest_email: z.string().trim().email().max(320),
  p_guest_phone: z.string().trim().min(10).max(64),
  p_description: z.string().max(5000),
  p_notes: z.string().max(5000).nullable(),
  p_estimated_cost: z.number().finite().nonnegative(),
  p_tax_amount: z.number().finite().nonnegative(),
  p_service_catalog_id: z.string().uuid().nullable(),
  p_vehicle_id: z.string().uuid(),
  p_location_address: z.string().trim().min(1).max(1000),
  p_location_lat: z.number().finite().min(-90).max(90).nullable().optional(),
  p_location_lng: z.number().finite().min(-180).max(180).nullable().optional(),
  p_status: z.literal("confirmed").default("confirmed"),
});

function serializeRpcError(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    message: typeof value.message === "string" ? value.message : "Public booking failed",
    code: typeof value.code === "string" ? value.code : undefined,
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
  };
}

/**
 * Canonical public appointment creation boundary.
 *
 * Browser code submits a typed booking contract to Hono. The database RPC name
 * is an implementation detail owned here, not a browser-selectable command.
 * The location is mandatory at creation time so every public appointment owns
 * its service location atomically.
 */
publicBookingRouter.post("/v1/public-bookings/appointments", async (c: Context) => {
  const body = publicBookingAppointmentSchema.parse(await c.req.json());
  const supabase = createSupabaseAnonServerClient() as any;

  const { data, error } = await supabase.rpc("public_booking_book_appointment_v3", {
    p_booking_slug: body.p_booking_slug,
    p_scheduled_date: body.p_scheduled_date,
    p_scheduled_time: body.p_scheduled_time,
    p_duration_minutes: body.p_duration_minutes,
    p_title: body.p_title,
    p_guest_name: body.p_guest_name,
    p_guest_email: body.p_guest_email,
    p_guest_phone: body.p_guest_phone,
    p_description: body.p_description,
    p_notes: body.p_notes,
    p_estimated_cost: body.p_estimated_cost,
    p_tax_amount: body.p_tax_amount,
    p_service_catalog_id: body.p_service_catalog_id,
    p_vehicle_id: body.p_vehicle_id,
    p_location_address: body.p_location_address,
    p_location_lat: body.p_location_lat ?? null,
    p_location_lng: body.p_location_lng ?? null,
    p_status: body.p_status,
  });

  if (error) return json({ data: null, error: serializeRpcError(error) });
  return json({ data, error: null });
});
