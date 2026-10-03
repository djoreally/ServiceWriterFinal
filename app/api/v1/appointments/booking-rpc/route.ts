import { z } from "zod";

import { ApiError, errorResponse, json } from "@/server/api";
import { clearBookingStage, readBookingStage, writeBookingStage } from "@/server/cutover/booking-stage";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";

const requestSchema = z.object({
  fn: z.string().min(1).max(80),
  params: z.record(z.string(), z.unknown()).nullable().optional(),
});

const aliases: Readonly<Record<string, string>> = {
  moms: "momsoilchange",
  "moms-mobile-oil-change": "momsoilchange",
};

function canonicalSlug(value: unknown) {
  const slug = z.string().trim().min(1).max(120).parse(value);
  return aliases[slug.toLowerCase()] ?? slug;
}
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberOrNull(value: unknown) { const n = typeof value === "number" ? value : Number(value); return Number.isFinite(n) ? n : null; }
function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || "Customer", lastName: parts.join(" ") };
}
function timeToMinute(value: unknown) {
  const raw = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).parse(value);
  const [hour, minute] = raw.split(":").map(Number);
  return hour * 60 + minute;
}
function rpcResult(data: unknown, status = 200) { return json({ data, error: null }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  try {
    const { fn, params = {} } = requestSchema.parse(await request.json());

    if (fn === "public_booking_upsert_customer") {
      const slug = canonicalSlug(params.p_booking_slug);
      const email = z.string().email().parse(params.p_email).toLowerCase();
      const name = z.string().trim().min(1).max(200).parse(params.p_name);
      const stage = await readBookingStage(slug);
      const tempId = stage.customer?.tempId ?? crypto.randomUUID();
      stage.customer = { tempId, email, name, phone: text(params.p_phone), address: text(params.p_address) };
      await writeBookingStage(stage);
      return rpcResult(tempId);
    }

    if (fn === "public_booking_upsert_vehicle") {
      const slug = canonicalSlug(params.p_booking_slug);
      const email = z.string().email().parse(params.p_customer_email).toLowerCase();
      const stage = await readBookingStage(slug);
      if (!stage.customer || stage.customer.email !== email) throw new ApiError(409, "Booking customer stage is missing or mismatched", "booking_stage_customer_mismatch");
      const vehicle = {
        tempId: crypto.randomUUID(),
        year: z.number().int().min(1900).max(2100).parse(params.p_year),
        make: z.string().trim().min(1).max(100).parse(params.p_make),
        model: z.string().trim().min(1).max(100).parse(params.p_model),
        licensePlate: text(params.p_license_plate), vin: text(params.p_vin), mileage: numberOrNull(params.p_mileage),
        oilType: text(params.p_oil_type), oilCapacity: text(params.p_oil_capacity), imageUrl: text(params.p_image_url), engine: text(params.p_engine), tireSize: null,
      };
      stage.vehicles.push(vehicle);
      await writeBookingStage(stage);
      return rpcResult(vehicle.tempId);
    }

    if (fn === "public_booking_set_vehicle_tire_spec_v3") {
      const slug = canonicalSlug(params.p_booking_slug);
      const stage = await readBookingStage(slug);
      const vehicleId = z.string().uuid().parse(params.p_vehicle_id);
      const vehicle = stage.vehicles.find((row) => row.tempId === vehicleId);
      if (!vehicle) throw new ApiError(404, "Staged booking vehicle not found", "booking_stage_vehicle_not_found");
      vehicle.tireSize = text(params.p_tire_size);
      await writeBookingStage(stage);
      return rpcResult(vehicleId);
    }

    if (fn === "public_booking_book_appointment_v2") {
      const slug = canonicalSlug(params.p_booking_slug);
      const stage = await readBookingStage(slug);
      if (!stage.customer || stage.vehicles.length === 0) throw new ApiError(409, "Booking customer and vehicle stage is incomplete", "booking_stage_incomplete");
      const primaryTempId = z.string().uuid().parse(params.p_vehicle_id);
      const primaryIndex = stage.vehicles.findIndex((row) => row.tempId === primaryTempId);
      if (primaryIndex < 0) throw new ApiError(409, "Primary staged vehicle is missing", "booking_stage_vehicle_not_found");
      const orderedVehicles = [stage.vehicles[primaryIndex], ...stage.vehicles.filter((_, index) => index !== primaryIndex)];
      const { firstName, lastName } = splitName(stage.customer.name);
      const fullAddress = stage.customer.address ?? "";
      const addressParts = fullAddress.split(",").map((part) => part.trim());
      const startMinute = timeToMinute(params.p_scheduled_time);
      const duration = Math.max(5, z.number().int().min(1).max(1440).parse(params.p_duration_minutes));
      const serviceId = z.string().uuid().parse(params.p_service_catalog_id);
      const payload = {
        customer: { firstName, lastName, email: stage.customer.email, phone: stage.customer.phone || "0000000", addressLine1: fullAddress || null, addressLine2: null, city: addressParts.length >= 3 ? addressParts[addressParts.length - 3] : null, region: addressParts.length >= 2 ? addressParts[addressParts.length - 2] : null, postalCode: addressParts.length >= 1 ? addressParts[addressParts.length - 1] : null },
        vehicle: { year: orderedVehicles[0].year, make: orderedVehicles[0].make, model: orderedVehicles[0].model, vin: orderedVehicles[0].vin || null, licensePlate: orderedVehicles[0].licensePlate || null, mileage: orderedVehicles[0].mileage, engine: orderedVehicles[0].engine, oilType: orderedVehicles[0].oilType, oilCapacity: orderedVehicles[0].oilCapacity, tireSize: orderedVehicles[0].tireSize },
        additionalVehicles: orderedVehicles.slice(1).map((vehicle) => ({ year: vehicle.year, make: vehicle.make, model: vehicle.model, vin: vehicle.vin || null, licensePlate: vehicle.licensePlate || null, mileage: vehicle.mileage, engine: vehicle.engine, oilType: vehicle.oilType, oilCapacity: vehicle.oilCapacity, tireSize: vehicle.tireSize })),
        serviceIds: [serviceId], vehicleServiceAssignments: [{ vehicleIndex: 0, serviceIds: [serviceId] }],
        localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(params.p_scheduled_date), startMinute, endMinute: Math.min(1440, startMinute + duration),
        notes: text(params.p_notes), paymentChoice: "pay_later" as const,
        consent: { termsAccepted: true as const, privacyAccepted: true as const, transactionalSmsOptIn: false, marketingEmailOptIn: false, marketingSmsOptIn: false },
        compatibility: { title: text(params.p_title), description: text(params.p_description), estimatedCostCents: Math.round((numberOrNull(params.p_estimated_cost) ?? 0) * 100), taxCents: Math.round((numberOrNull(params.p_tax_amount) ?? 0) * 100), locationAddress: stage.customer.address ?? null, source: "ServiceWriterFinal-cutover" },
      };
      const result = await serviceWriterApi<{ appointmentId: string; vehicleIds: string[] }>(request, `/api/v1/public/booking/${slug}/book`, { method: "POST", headers: { "idempotency-key": ensureIdempotencyKey(request) }, body: JSON.stringify(payload) });
      const refreshed = await readBookingStage(slug);
      (refreshed as typeof refreshed & { appointmentId?: string; canonicalVehicleIds?: string[] }).appointmentId = result.appointmentId;
      (refreshed as typeof refreshed & { appointmentId?: string; canonicalVehicleIds?: string[] }).canonicalVehicleIds = result.vehicleIds;
      await writeBookingStage(refreshed);
      return rpcResult(result.appointmentId);
    }

    if (fn === "public_booking_insert_services_v7") {
      const slug = canonicalSlug(params.p_booking_slug);
      const appointmentId = z.string().uuid().parse(params.p_appointment_id);
      const stage = await readBookingStage(slug) as Awaited<ReturnType<typeof readBookingStage>> & { appointmentId?: string; canonicalVehicleIds?: string[] };
      if (!stage.customer || stage.appointmentId !== appointmentId) throw new ApiError(404, "Fresh booking stage not found", "booking_stage_not_found");
      const items = z.array(z.object({ vehicle_id: z.string().uuid().nullable().optional(), service_catalog_id: z.string().uuid().nullable(), name: z.string().min(1).max(500), price: z.number().nonnegative(), quantity: z.number().positive(), is_prepaid: z.boolean() })).parse(params.p_services);
      const mapped = items.map((item) => {
        const stagedIndex = item.vehicle_id ? stage.vehicles.findIndex((vehicle) => vehicle.tempId === item.vehicle_id) : -1;
        return { serviceId: item.service_catalog_id, vehicleId: stagedIndex >= 0 ? stage.canonicalVehicleIds?.[stagedIndex] ?? null : null, name: item.name, priceCents: Math.round(item.price * 100), quantityMilli: Math.round(item.quantity * 1000), prepaid: item.is_prepaid };
      });
      await serviceWriterApi(request, `/api/v1/public/booking/${slug}/appointments/${appointmentId}/services`, { method: "POST", headers: { "idempotency-key": ensureIdempotencyKey(request) }, body: JSON.stringify({ email: stage.customer.email, phone: stage.customer.phone ?? "", items: mapped }) });
      return rpcResult(appointmentId);
    }

    if (["public_booking_save_configuration_v2", "public_booking_update_appointment_context_v2", "public_booking_record_payment_intent_v3", "reserve_tire_inventory_for_appointment", "assign_van_by_zip"].includes(fn)) {
      // Stage 22 compatibility no-op. Canonical Stage 18 already persists the
      // booking, paymentChoice and vehicle/service assignment evidence. Dispatch,
      // inventory reservation and pending-payment materialization are separate
      // post-cutover domains and must not write the retired frontend database.
      return rpcResult(null);
    }

    if (fn === "link_customer_portal_account_v1") return rpcResult(null);

    throw new ApiError(410, `Legacy booking RPC '${fn}' is disabled during canonical cutover`, "legacy_booking_rpc_disabled");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  await clearBookingStage();
  return rpcResult({ cleared: true });
}
