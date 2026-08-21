/**
 * Customer Detail Query - Fetch customer data with vehicles, services, quotes, and appointments.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface CustomerDetailResult {
  customer: any;
  vehicles: any[];
  services: any[];
  quotes: any[];
  appointments: any[];
  /** Successful payment records (amount in cents) for billed-total calculation */
  paymentRecords: { amount: number; status: string }[];
}

/**
 * Escape special characters for PostgREST ilike/like patterns.
 * 
 * PostgREST uses SQL LIKE patterns where:
 * - % matches any sequence of characters
 * - _ matches any single character
 * - \ is the escape character
 * 
 * This function escapes these characters to ensure literal matching.
 * 
 * @param value - The string to escape
 * @returns The input string with `%`, `_`, and `\` characters escaped with backslashes
 * @see https://postgrest.org/en/stable/api.html#operators
 */
function escapePostgrestPattern(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/** UUID v4 format validation regex */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fetch full customer detail with related data (defense-in-depth with user_id). */
export async function fetchCustomerDetail(customerId: string): Promise<CustomerDetailResult | null> {
  // Validate customerId format to prevent injection
  if (!customerId || !UUID_REGEX.test(customerId)) {
    return null;
  }

  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  // First, fetch customer to get their email for appointment lookup
  const customerRes = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("user_id", user.id)
    .single();

  if (customerRes.error || !customerRes.data) return null;

  const customerEmail = customerRes.data.email;

  // Build appointment query: match by customer_id OR guest_email (for public bookings)
  let appointmentsQuery = supabase
    .from("appointments")
    .select("*")
    .order("scheduled_date", { ascending: false });

  if (customerEmail) {
    // Match appointments by customer_id OR by guest_email matching customer's email
    const escapedEmail = escapePostgrestPattern(customerEmail.toLowerCase());
    appointmentsQuery = appointmentsQuery.or(`customer_id.eq.${customerId},guest_email.ilike.${escapedEmail}`);
  } else {
    // No email - just match by customer_id
    appointmentsQuery = appointmentsQuery.eq("customer_id", customerId);
  }

  const [vehiclesRes, servicesRes, quotesRes, appointmentsRes] = await Promise.all([
    supabase.from("vehicles").select("*").eq("customer_id", customerId).order("year", { ascending: false }),
    supabase.from("services").select("*").eq("customer_id", customerId).order("service_date", { ascending: false }),
    supabase.from("quotes").select("*").eq("customer_id", customerId).order("quote_date", { ascending: false }),
    appointmentsQuery,
  ]);

  // Collect vehicles directly linked to customer
  let vehicles = vehiclesRes.data ?? [];
  const seenVehicleIds = new Set(vehicles.map((v: { id: string }) => v.id));

  // Also include vehicles from appointments that aren't already in the list
  // This catches vehicles linked via appointment.vehicle_id that might not have customer_id set
  const appointments = appointmentsRes.data ?? [];
  const appointmentVehicleIds = appointments
    .map((a: { vehicle_id?: string | null }) => a.vehicle_id)
    .filter((id: string | null | undefined): id is string => !!id && !seenVehicleIds.has(id));

  if (appointmentVehicleIds.length > 0) {
    const { data: appointmentVehicles } = await supabase
      .from("vehicles")
      .select("*")
      .in("id", appointmentVehicleIds);
    if (appointmentVehicles) {
      vehicles = [...vehicles, ...appointmentVehicles];
    }
  }

  // Fetch payment records for billed-total: match by customer email or appointment IDs
  const appointmentIds = appointments.map((a: { id: string }) => a.id);
  let paymentRecords: { amount: number; status: string }[] = [];

  if (appointmentIds.length > 0 || customerEmail) {
    let payQuery = supabase
      .from("payments")
      .select("amount, status")
      .eq("status", "succeeded");

    if (appointmentIds.length > 0 && customerEmail) {
      const escapedEmail = escapePostgrestPattern(customerEmail.toLowerCase());
      payQuery = payQuery.or(
        `appointment_id.in.(${appointmentIds.join(",")}),customer_email.ilike.${escapedEmail}`
      );
    } else if (appointmentIds.length > 0) {
      payQuery = payQuery.in("appointment_id", appointmentIds);
    } else if (customerEmail) {
      const escapedEmail = escapePostgrestPattern(customerEmail.toLowerCase());
      payQuery = payQuery.ilike("customer_email", escapedEmail);
    }

    const { data: payData } = await payQuery;
    paymentRecords = (payData ?? []) as { amount: number; status: string }[];
  }

  return {
    customer: customerRes.data,
    vehicles,
    services: servicesRes.data ?? [],
    quotes: quotesRes.data ?? [],
    appointments,
    paymentRecords,
  };
}
