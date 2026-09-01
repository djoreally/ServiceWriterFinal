/**
 * Appointment Detail Query — canonical read operations for AppointmentDetail.
 * The detail page still renders the preserved Appointment shape, so this module
 * translates the canonical API response instead of leaking raw database rows
 * into the legacy UI.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser as resolveCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { nextApi } from "@/lib/nextApiClient";

export async function getCurrentAuthUser() {
  const { data: { user } } = await resolveCurrentAuthUser();
  return user;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function localDateTime(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Fetch a single appointment and adapt canonical relations/metadata to the UI contract. */
export async function fetchAppointmentWithRelations(id: string, _userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("No active workspace is available.") };

  try {
    const response = await nextApi.appointments.get(context.workspaceId, id);
    const row = response.data as Record<string, any> | null;
    if (!row) return { data: null, error: new Error("Appointment not found.") };

    const metadata = object(row.metadata);
    const customerRow = one<Record<string, any>>(row.customers);
    const vehicleRow = one<Record<string, any>>(row.vehicles);
    const startsAt = String(row.starts_at || "");
    const endsAt = String(row.ends_at || row.starts_at || "");
    const start = localDateTime(startsAt);
    const durationMinutes = Math.max(5, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000) || 60);

    const customer = customerRow ? {
      id: customerRow.id,
      name: [customerRow.first_name, customerRow.last_name].filter(Boolean).join(" ") || customerRow.company_name || "Customer",
      email: customerRow.email ?? "",
      phone: customerRow.phone ?? "",
      address: [customerRow.address_line1, customerRow.address_line2, customerRow.city, customerRow.region, customerRow.postal_code].filter(Boolean).join(", "),
      notes: customerRow.notes ?? undefined,
    } : null;

    const vehicle = vehicleRow ? {
      id: vehicleRow.id,
      customer_id: vehicleRow.customer_id ?? undefined,
      year: Number(vehicleRow.year || new Date().getFullYear()),
      make: vehicleRow.make || "Unknown",
      model: vehicleRow.model || "Unknown",
      vin: vehicleRow.vin ?? undefined,
      license_plate: vehicleRow.license_plate ?? undefined,
      plate_state: vehicleRow.plate_region ?? undefined,
      color: vehicleRow.color ?? undefined,
      mileage: vehicleRow.mileage ?? undefined,
      notes: vehicleRow.notes ?? undefined,
    } : null;

    const serviceCatalogId = text(metadata.service_catalog_id);
    let serviceCatalog: Record<string, unknown> | null = null;
    if (serviceCatalogId) {
      const { data: service } = await supabase
        .from("service_catalog")
        .select("id,name,description,category,labor_price,estimated_minutes,is_active")
        .eq("workspace_id", context.workspaceId)
        .eq("id", serviceCatalogId)
        .maybeSingle();
      if (service) {
        serviceCatalog = {
          id: service.id,
          name: service.name,
          description: service.description || "",
          category: service.category ?? undefined,
          default_price: Number(service.labor_price ?? 0),
          estimated_duration: service.estimated_minutes ?? undefined,
          is_active: service.is_active,
        };
      }
    }

    return {
      data: {
        ...row,
        title: text(metadata.title) || text(metadata.service_name) || "Appointment",
        description: text(metadata.description) || row.notes || undefined,
        scheduled_date: start.date,
        scheduled_time: start.time,
        duration_minutes: durationMinutes,
        customer,
        vehicle,
        service_catalog: serviceCatalog,
        guest_name: text(metadata.guest_name) || customer?.name || null,
        guest_email: text(metadata.guest_email) || customer?.email || null,
        guest_phone: text(metadata.guest_phone) || customer?.phone || null,
        estimated_cost: Number(metadata.estimated_cost ?? 0),
        tax_amount: Number(metadata.tax_amount ?? 0),
        location_address: text(metadata.location_address),
        customer_city: text(metadata.customer_city),
        customer_state: text(metadata.customer_state),
        customer_postal_code: text(metadata.customer_postal_code),
        intake_responses: metadata,
        assigned_technician_id: row.assigned_user_id ?? null,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
}

/** Vehicle-spec enrichment is optional; canonical vehicle rows remain usable without it. */
export async function fetchVehicleSpecs(make: string, model: string, year: string | number) {
  const { data, error } = await supabase
    .from("vehicle_service_specs")
    .select("metadata")
    .eq("make", make)
    .eq("model", model)
    .eq("year", Number(year))
    .maybeSingle();
  if (error || !data) return { data: null, error };
  const metadata = object(data.metadata);
  return {
    data: {
      oil_type: text(metadata.oil_type) || text(metadata.oil_viscosity),
      oil_capacity: text(metadata.oil_capacity),
      engine: text(metadata.engine),
    },
    error: null,
  };
}

/** Fallback contact lookup, scoped to the selected workspace rather than legacy user_id. */
export async function fetchCustomerAddressByGuestEmail(email: string, _userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("No active workspace is available.") };
  const result = await supabase
    .from("customers")
    .select("address_line1,address_line2,city,region,postal_code,phone")
    .eq("workspace_id", context.workspaceId)
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    ...result,
    data: result.data ? {
      address: [result.data.address_line1, result.data.address_line2, result.data.city, result.data.region, result.data.postal_code].filter(Boolean).join(", "),
      phone: result.data.phone,
    } : null,
  };
}

export async function fetchSucceededPayments(appointmentId: string) {
  return supabase
    .from("payments")
    .select("status, payment_type")
    .eq("appointment_id", appointmentId)
    .eq("status", "succeeded");
}

/** Fee settings now live in workspace_settings. */
export async function fetchAppointmentFeeSettings(_userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("No active workspace is available.") };
  return supabase
    .from("workspace_settings")
    .select("waste_oil_fee_enabled,waste_oil_fee,shop_fee_enabled,shop_fee_type,shop_fee_value,shop_fee_description,surcharge_enabled,surcharge_type,surcharge_value,surcharge_description,tax_rate")
    .eq("workspace_id", context.workspaceId)
    .single();
}
