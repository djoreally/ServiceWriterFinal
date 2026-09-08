import { supabase } from "@/integrations/supabase/client";
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { nextApi } from "@/lib/nextApiClient";

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function fetchAppointmentBookingConfiguration(appointmentId: string): Promise<AppointmentBookingConfiguration | null> {
  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: { configuration: AppointmentBookingConfiguration } | null; error: { message: string } | null }>;
        };
      };
    };
  }).from("appointment_booking_configurations").select("configuration").eq("appointment_id", appointmentId).maybeSingle();
  if (error) throw error;
  if (data?.configuration?.vehicles?.length) return data.configuration;

  // Historical and staff-created appointments may predate the immutable booking
  // snapshot. Fall back to the canonical appointment → vehicle → service-spec
  // relationship so the UI still shows the exact vehicle and oil requirements.
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const response = await nextApi.appointments.get(context.workspaceId, appointmentId);
  const appointment = response.data as Record<string, unknown> | null;
  if (!appointment) return null;

  const vehicle = one<Record<string, unknown>>(
    appointment.vehicles as Record<string, unknown> | Record<string, unknown>[] | null | undefined,
  );
  if (!vehicle?.id) return null;

  const specResult = await (supabase as any)
    .from("vehicle_service_specs")
    .select("engine,oil_type,oil_capacity,oil_filter")
    .eq("workspace_id", context.workspaceId)
    .eq("vehicle_id", String(vehicle.id))
    .maybeSingle();
  if (specResult.error) throw specResult.error;
  const specs = specResult.data as Record<string, unknown> | null;

  const oil = specs && [specs.engine, specs.oil_type, specs.oil_capacity, specs.oil_filter].some(Boolean)
    ? {
        engine: text(specs.engine),
        oilType: text(specs.oil_type),
        oilCapacity: text(specs.oil_capacity),
        oilFilter: text(specs.oil_filter),
        capacitySource: "manual" as const,
      }
    : undefined;

  return {
    schemaVersion: 2,
    capturedAt: text(appointment.updated_at) || text(appointment.created_at) || text(appointment.starts_at) || new Date(0).toISOString(),
    vehicles: [{
      clientVehicleId: String(vehicle.id),
      vehicle: {
        year: String(vehicle.year || ""),
        make: String(vehicle.make || "Unknown"),
        model: String(vehicle.model || "Unknown"),
        vin: text(vehicle.vin),
        licensePlate: text(vehicle.license_plate),
      },
      ...(oil ? { oil } : {}),
    }],
  };
}
