/**
 * Reports Query — Centralizes all reporting data fetches
 * 
 * Abstracts direct Supabase calls for the reports/analytics pages.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Fetch payments for a date range ────────────────────────────────
export async function fetchReportPayments(fromDate: string, toDate: string) {
  return supabase
    .from("payments")
    .select("id, amount, created_at, status, customer_email, customer_name, refund_amount, payment_type, tax_amount, platform_fee, subtotal, metadata, appointment_id, data_origin, appointments(status)")
    .gte("created_at", `${fromDate}T00:00:00`)
    .lte("created_at", `${toDate}T23:59:59`)
    .order("created_at", { ascending: false });
}

// ── Fetch services for a date range ────────────────────────────────
export async function fetchReportServices(fromDate: string, toDate: string, limit?: number) {
  let q = supabase
    .from("services")
    .select("id, service_type, total_cost, tax_amount, discount_amount, shop_supplies, paid_amount, payment_status, service_date, status, appointment_id, data_origin, vehicle:vehicles(make, model, year)")
    .gte("service_date", fromDate)
    .lte("service_date", toDate)
    .order("service_date", { ascending: false });
  if (limit) q = q.limit(limit);
  return q;
}

// ── Fetch appointments for a date range ────────────────────────────
export async function fetchReportAppointments(fromDate: string, toDate: string, limit?: number) {
  let q = supabase
    .from("appointments")
    .select("id, title, scheduled_date, scheduled_time, duration_minutes, status, guest_name, guest_email, estimated_cost, tax_amount, customer_id, customer_postal_code, location_address, travel_time_minutes, actual_start_time, actual_end_time, assigned_technician_id, updated_at, data_origin, customer:customers(name, postal_code, address), vehicle:vehicles(make, model, year)")
    .neq("source", "fleet_work_order")
    .gte("scheduled_date", fromDate)
    .lte("scheduled_date", toDate)
    .order("scheduled_date", { ascending: false });
  if (limit) q = q.limit(limit);
  return q;
}

// ── Fetch customers overview (top by LTV) ──────────────────────────
export async function fetchReportCustomers(limit = 200) {
  return supabase
    .from("customers")
    .select("id, name, email, phone, lifetime_value, total_services, last_service_date, customer_segment, churn_risk, average_order_value, first_service_date, visit_frequency_days, days_since_last_service, data_origin")
    .order("lifetime_value", { ascending: false })
    .limit(limit);
}

// ── Fetch vehicles overview ────────────────────────────────────────
export async function fetchReportVehicles(limit = 500) {
  return supabase
    .from("vehicles")
    .select("id, year, make, model, vin, license_plate, oil_type, mileage, engine, data_origin, customer:customers(name), updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
}

// ── Fetch previous-period payments for comparison ──────────────────
export async function fetchPreviousPeriodPayments(prevFrom: string, prevTo: string) {
  return supabase
    .from("payments")
    .select("id, amount, status")
    .gte("created_at", `${prevFrom}T00:00:00`)
    .lte("created_at", `${prevTo}T23:59:59`);
}

// ── Fetch YTD payments ─────────────────────────────────────────────
export async function fetchYtdPayments(ytdFrom: string) {
  return supabase
    .from("payments")
    .select("amount, status")
    .gte("created_at", `${ytdFrom}T00:00:00`);
}

// ── Fetch active technicians ───────────────────────────────────────
export async function fetchActiveTechnicians() {
  return supabase
    .from("technicians")
    .select("id, name, status, skills")
    .eq("is_active", true);
}

// ── Fetch technician appointments for performance ──────────────────
export async function fetchTechnicianAppointmentsForPerformance(fromDate: string, toDate: string) {
  return supabase
    .from("appointments")
    .select("id, assigned_technician_id, status, estimated_cost, estimated_duration_minutes, actual_start_time, actual_end_time, scheduled_date")
    .neq("source", "fleet_work_order")
    .gte("scheduled_date", fromDate)
    .lte("scheduled_date", toDate)
    .not("assigned_technician_id", "is", null);
}

// ── Fetch rolling services (for geo/backfill) ──────────────────────
export async function fetchRollingServices(geoFrom: string, toDate: string, limit = 2000) {
  return supabase
    .from("services")
    .select("id, service_type, total_cost, tax_amount, discount_amount, shop_supplies, paid_amount, payment_status, service_date, status, appointment_id")
    .gte("service_date", geoFrom)
    .lte("service_date", toDate)
    .order("service_date", { ascending: false })
    .limit(limit);
}

// ── Fetch rolling appointments (for geo/backfill) ──────────────────
export async function fetchRollingAppointments(geoFrom: string, toDate: string, limit = 2000) {
  return supabase
    .from("appointments")
    .select("id, scheduled_date, scheduled_time, duration_minutes, status, estimated_cost, customer_id, customer_postal_code, location_address, travel_time_minutes, customer:customers(postal_code, address)")
    .neq("source", "fleet_work_order")
    .gte("scheduled_date", geoFrom)
    .lte("scheduled_date", toDate)
    .order("scheduled_date", { ascending: false })
    .limit(limit);
}
