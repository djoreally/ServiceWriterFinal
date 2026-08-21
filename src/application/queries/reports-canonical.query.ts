/**
 * Canonical Reports Query
 *
 * Single trustworthy data source for the Analytics Hub. All money values
 * use the canonical financial model:
 *   - Collected revenue → `cash_collection_receipts_v1.net_collected_cents`.
 *   - Billed revenue / Outstanding A/R → `services.total_cost` /
 *     `services.payment_status` for completed services.
 *
 * Imported historical records (`data_origin = 'legacy_import'`) are excluded
 * by default so the hub reflects native operations. Callers can opt-in to
 * include legacy data via the `includeLegacy` flag.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { computeFinancialSummary } from "@/domain/financials/canonical-financials";
import { toCents } from "@/lib/financialMath";
import { format, startOfYear, subDays } from "date-fns";

export interface ReportsKpi {
  // Revenue (dollars)
  collected: number;
  collectedPrev: number;
  billed: number;
  outstanding: number;
  refunds: number;
  taxCollected: number;

  // YTD baseline (dollars)
  ytdCollected: number;
  ytdBilled: number;

  // Operations
  jobsCompleted: number;
  jobsTotal: number;
  jobsCancelled: number;
  appointmentsBooked: number;
  appointmentsNoShow: number;
  avgTicket: number;
  avgDurationMin: number;

  // Customers & Vehicles
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  totalVehicles: number;
  uniqueServiceCustomers: number;

  // Mix
  revenueByServiceType: Array<{ type: string; revenue: number; count: number }>;
  revenueByPaymentMethod: Array<{ method: string; revenue: number; count: number }>;
  topMakes: Array<{ make: string; count: number }>;
  topZips: Array<{ zip: string; jobs: number; revenue: number }>;

  // Trend (daily, last N days within range)
  dailyRevenue: Array<{ date: string; collected: number; billed: number }>;

  // Period info
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  legacyExcluded: number; // count of records hidden by data-origin filter
}

export interface ReportsRange {
  from: Date;
  to: Date;
  label: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  refund_amount: number | null;
  status: string;
  created_at: string;
  payment_type: string | null;
  tax_amount: number | null;
  data_origin: string | null;
  metadata: Json | null;
}

interface ServiceRow {
  id: string;
  service_type: string;
  total_cost: number | null;
  paid_amount: number | null;
  payment_status: string | null;
  status: string;
  service_date: string;
  data_origin: string | null;
  customer_id: string | null;
  vehicle: { make: string | null; model: string | null; year: number | null } | null;
}

interface AppointmentRow {
  id: string;
  status: string;
  scheduled_date: string;
  duration_minutes: number | null;
  estimated_cost: number | null;
  customer_postal_code: string | null;
  data_origin: string | null;
}

interface CustomerRow {
  id: string;
  created_at: string;
  total_services: number | null;
  data_origin: string | null;
}

interface VehicleRow {
  id: string;
  make: string | null;
  data_origin: string | null;
}

function asJsonObject(value: Json | null | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveMethod(p: PaymentRow): string {
  const meta = asJsonObject(p.metadata);
  if (meta.manual_payment && meta.payment_method) return String(meta.payment_method);
  if (meta.booking_source === "online_public_booking" || p.payment_type === "booking_deposit") return "online_card";
  if (p.payment_type === "invoice_payment") return "invoice";
  if (p.payment_type === "pay_at_service") return "cash";
  return p.payment_type || "card";
}

export async function fetchReportsCanonical(
  range: ReportsRange,
  includeLegacy = false,
): Promise<ReportsKpi> {
  const fromDate = format(range.from, "yyyy-MM-dd");
  const toDate = format(range.to, "yyyy-MM-dd");
  const periodDays = Math.max(
    Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000),
    1,
  );
  const prevFrom = format(subDays(range.from, periodDays), "yyyy-MM-dd");
  const prevTo = format(subDays(range.from, 1), "yyyy-MM-dd");
  const ytdFrom = format(startOfYear(new Date()), "yyyy-MM-dd");

  const [pay, payPrev, payYtd, svc, svcYtd, appt, custAll, vehAll] = await Promise.all([
    supabase
      .from("cash_collection_receipts_v1")
      .select("id:payment_record_id, amount:collected_cents, refund_amount:refunded_cents, status:payment_status, created_at:collected_at, payment_type, tax_amount, data_origin, metadata")
      .gte("collected_at", `${fromDate}T00:00:00`)
      .lte("collected_at", `${toDate}T23:59:59`),
    supabase
      .from("cash_collection_receipts_v1")
      .select("id:payment_record_id, amount:collected_cents, refund_amount:refunded_cents, status:payment_status, created_at:collected_at, payment_type, tax_amount, data_origin, metadata")
      .gte("collected_at", `${prevFrom}T00:00:00`)
      .lte("collected_at", `${prevTo}T23:59:59`),
    supabase
      .from("cash_collection_receipts_v1")
      .select("amount:collected_cents, refund_amount:refunded_cents, status:payment_status, data_origin")
      .gte("collected_at", `${ytdFrom}T00:00:00`),
    supabase
      .from("services")
      .select("id, service_type, total_cost, paid_amount, payment_status, status, service_date, data_origin, customer_id, vehicle:vehicles(make, model, year)")
      .gte("service_date", fromDate)
      .lte("service_date", toDate),
    supabase
      .from("services")
      .select("id, total_cost, paid_amount, payment_status, status, service_date, data_origin")
      .gte("service_date", ytdFrom),
    supabase
      .from("appointments")
      .select("id, status, scheduled_date, duration_minutes, estimated_cost, customer_postal_code, data_origin")
      .neq("source", "fleet_work_order")
      .gte("scheduled_date", fromDate)
      .lte("scheduled_date", toDate),
    supabase
      .from("customers")
      .select("id, created_at, total_services, data_origin"),
    supabase
      .from("vehicles")
      .select("id, make, data_origin"),
  ]);

  const filterOrigin = <T extends { data_origin: string | null }>(rows: T[] | null): T[] => {
    if (!rows) return [];
    if (includeLegacy) return rows;
    return rows.filter((r) => r.data_origin !== "legacy_import");
  };

  // Track how much legacy data we are hiding (helps the UI show transparency).
  const legacyExcluded =
    ((pay.data || []) as PaymentRow[]).filter((r) => r.data_origin === "legacy_import").length +
    ((svc.data || []) as ServiceRow[]).filter((r) => r.data_origin === "legacy_import").length +
    ((appt.data || []) as AppointmentRow[]).filter((r) => r.data_origin === "legacy_import").length;

  const payments = filterOrigin((pay.data || []) as PaymentRow[]);
  const paymentsPrev = filterOrigin((payPrev.data || []) as PaymentRow[]);
  const paymentsYtd = filterOrigin((payYtd.data || []) as Pick<PaymentRow, "amount" | "refund_amount" | "status" | "data_origin">[]);
  const services = filterOrigin((svc.data || []) as ServiceRow[]);
  const servicesYtd = filterOrigin((svcYtd.data || []) as Pick<ServiceRow, "total_cost" | "paid_amount" | "payment_status" | "status" | "data_origin">[]);
  const appointments = filterOrigin((appt.data || []) as AppointmentRow[]);
  const customers = filterOrigin((custAll.data || []) as CustomerRow[]);
  const vehicles = filterOrigin((vehAll.data || []) as VehicleRow[]);

  const periodSummary = computeFinancialSummary({
    services: services
      .filter((s) => s.status === "completed")
      .map((s) => ({
        totalDueCents: toCents(Math.round((Number(s.total_cost) || 0) * 100)),
        balanceDueCents: toCents(
          s.payment_status === "unpaid" || s.payment_status === "partial"
            ? Math.max(Math.round(((Number(s.total_cost) || 0) - (Number(s.paid_amount) || 0)) * 100), 0)
            : 0,
        ),
        jobStatus: "completed" as const,
      })),
    payments: payments.map((p) => ({
      amountCents: toCents(Number(p.amount) || 0),
      refundAmountCents: Number(p.refund_amount) || 0,
      status: p.status,
    })),
  });

  const prevSummary = computeFinancialSummary({
    services: [],
    payments: paymentsPrev.map((p) => ({
      amountCents: toCents(Number(p.amount) || 0),
      refundAmountCents: Number(p.refund_amount) || 0,
      status: p.status,
    })),
  });

  const ytdSummary = computeFinancialSummary({
    services: servicesYtd
      .filter((s) => s.status === "completed")
      .map((s) => ({
        totalDueCents: toCents(Math.round((Number(s.total_cost) || 0) * 100)),
        balanceDueCents: toCents(0),
        jobStatus: "completed" as const,
      })),
    payments: paymentsYtd.map((p) => ({
      amountCents: toCents(Number(p.amount) || 0),
      refundAmountCents: Number(p.refund_amount) || 0,
      status: p.status,
    })),
  });

  const taxCollectedCents = payments.reduce((sum, p) => {
    if (p.tax_amount && p.tax_amount > 0) return sum + Number(p.tax_amount);
    const pricingDetails = asJsonObject(asJsonObject(p.metadata).pricing_details as Json | null);
    const meta = Number(pricingDetails.taxAmount ?? 0);
    if (meta > 0) return sum + meta;
    return sum;
  }, 0);

  // Operations
  const completed = appointments.filter((a) => a.status === "completed");
  const cancelled = appointments.filter((a) => a.status === "cancelled");
  const noShow = appointments.filter((a) => a.status === "no_show");
  const durations = completed.map((a) => Number(a.duration_minutes) || 0).filter((d) => d > 0);
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Customer aggregates
  const newCustomers = customers.filter((c) => {
    const createdAt = new Date(c.created_at);
    return createdAt >= range.from && createdAt <= range.to;
  }).length;
  const repeatCustomers = customers.filter((c) => (c.total_services || 0) > 1).length;
  const uniqueServiceCustomers = new Set(
    services.filter((s) => s.customer_id).map((s) => s.customer_id as string),
  ).size;

  // Service-type revenue (billed, from completed services)
  const typeMap = new Map<string, { revenue: number; count: number }>();
  for (const s of services.filter((x) => x.status === "completed")) {
    const t = s.service_type || "Other";
    const cur = typeMap.get(t) || { revenue: 0, count: 0 };
    cur.revenue += Number(s.total_cost) || 0;
    cur.count += 1;
    typeMap.set(t, cur);
  }
  const revenueByServiceType = Array.from(typeMap.entries())
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  // Payment method revenue (collected)
  const methodMap = new Map<string, { revenue: number; count: number }>();
  for (const p of payments) {
    const m = resolveMethod(p);
    const net = ((Number(p.amount) || 0) - (Number(p.refund_amount) || 0)) / 100;
    const cur = methodMap.get(m) || { revenue: 0, count: 0 };
    cur.revenue += net;
    cur.count += 1;
    methodMap.set(m, cur);
  }
  const revenueByPaymentMethod = Array.from(methodMap.entries())
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  // Top makes
  const makeMap = new Map<string, number>();
  for (const v of vehicles) {
    if (!v.make) continue;
    makeMap.set(v.make, (makeMap.get(v.make) || 0) + 1);
  }
  const topMakes = Array.from(makeMap.entries())
    .map(([make, count]) => ({ make, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Top zips
  const zipMap = new Map<string, { jobs: number; revenue: number }>();
  for (const a of appointments) {
    const zip = a.customer_postal_code;
    if (!zip) continue;
    const cur = zipMap.get(zip) || { jobs: 0, revenue: 0 };
    cur.jobs += 1;
    cur.revenue += Number(a.estimated_cost) || 0;
    zipMap.set(zip, cur);
  }
  const topZips = Array.from(zipMap.entries())
    .map(([zip, v]) => ({ zip, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Daily revenue trend
  const dayMap = new Map<string, { collected: number; billed: number }>();
  for (const p of payments) {
    const d = (p.created_at || "").slice(0, 10);
    if (!d) continue;
    const cur = dayMap.get(d) || { collected: 0, billed: 0 };
    cur.collected += ((Number(p.amount) || 0) - (Number(p.refund_amount) || 0)) / 100;
    dayMap.set(d, cur);
  }
  for (const s of services.filter((x) => x.status === "completed")) {
    const d = s.service_date;
    if (!d) continue;
    const cur = dayMap.get(d) || { collected: 0, billed: 0 };
    cur.billed += Number(s.total_cost) || 0;
    dayMap.set(d, cur);
  }
  const dailyRevenue = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    collected: periodSummary.collectedCents / 100,
    collectedPrev: prevSummary.collectedCents / 100,
    billed: periodSummary.bookedCents / 100,
    outstanding: periodSummary.outstandingCents / 100,
    refunds: periodSummary.refundedCents / 100,
    taxCollected: taxCollectedCents / 100,

    ytdCollected: ytdSummary.collectedCents / 100,
    ytdBilled: ytdSummary.bookedCents / 100,

    jobsCompleted: completed.length,
    jobsTotal: appointments.length,
    jobsCancelled: cancelled.length,
    appointmentsBooked: appointments.length,
    appointmentsNoShow: noShow.length,
    avgTicket:
      completed.length > 0 ? periodSummary.bookedCents / 100 / Math.max(completed.length, 1) : 0,
    avgDurationMin: avgDuration,

    totalCustomers: customers.length,
    newCustomers,
    repeatCustomers,
    totalVehicles: vehicles.length,
    uniqueServiceCustomers,

    revenueByServiceType,
    revenueByPaymentMethod,
    topMakes,
    topZips,

    dailyRevenue,

    periodStart: fromDate,
    periodEnd: toDate,
    periodLabel: range.label,
    legacyExcluded,
  };
}

interface AuditCustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  lifetime_value: number | null;
  total_services: number | null;
  average_order_value: number | null;
  last_service_date: string | null;
  data_origin: string | null;
  health_tier?: string | null;
}

interface AuditVehicleRow {
  id: string;
  customer_id: string | null;
  vin: string | null;
  mileage: number | null;
  oil_capacity: string | null;
  oil_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  data_origin: string | null;
}

interface AuditAppointmentRow {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  status: string;
  scheduled_date: string;
  service_record_id: string | null;
  payment_status: string | null;
  description: string | null;
  title: string | null;
  data_origin: string | null;
}

interface AuditServiceRow {
  id: string;
  appointment_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  service_date: string;
  status: string;
  description: string | null;
  parts_used: string | null;
  notes: string | null;
  total_cost: number | null;
  oil_quarts_used: number | null;
  payment_status: string | null;
  data_origin: string | null;
}

interface AuditInvoiceRow {
  id: string;
  customer_id: string | null;
  status: string;
  total: number | null;
}

interface AuditSmsLogRow {
  id: string;
  appointment_id: string | null;
  created_at: string;
}

interface AuditReviewRow {
  id: string;
  service_id: string | null;
  status: string | null;
  customer_id: string | null;
}

interface AuditInspectionRow {
  id: string;
  appointment_id: string | null;
  service_id: string | null;
  status: string | null;
}

interface AuditInvoiceItemRow {
  id: string;
  invoice_id: string | null;
  description: string | null;
  line_total: number | null;
  service_catalog_id: string | null;
  vehicle_id: string | null;
}

interface AuditAppointmentItemRow {
  id: string;
  appointment_id: string | null;
  name: string | null;
  price: number | null;
  quantity: number | null;
  service_catalog_id: string | null;
}

export interface ServiceWriterAuditResult {
  placeholderBadDefaults: Array<{ label: string; count: number; detail: string }>;
  actualBugs: Array<{ label: string; count: number; detail: string }>;
  standardIssues: Array<{ label: string; count: number; detail: string }>;
  productionCleanup: Array<{ label: string; count: number; detail: string; action: string }>;
}

function isPlaceholderText(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return /^(placeholder|sample|demo|test|unknown|n\/a|none)$/i.test(text) || text.includes("demo.com");
}

function auditRecordDate(row: AuditAppointmentRow | AuditServiceRow): string {
  return "scheduled_date" in row ? row.scheduled_date : row.service_date;
}

export async function fetchServiceWriterAudit(): Promise<ServiceWriterAuditResult> {
  const [customersRes, vehiclesRes, appointmentsRes, servicesRes, invoicesRes, smsRes, reviewsRes, inspectionsRes, invoiceItemsRes, appointmentItemsRes] = await Promise.all([
    supabase.from("customers").select("id, name, email, phone, address, lifetime_value, total_services, average_order_value, last_service_date, data_origin"),
    supabase.from("vehicles").select("id, customer_id, vin, mileage, oil_capacity, oil_type, make, model, year, data_origin"),
    supabase.from("appointments").select("id, customer_id, vehicle_id, status, scheduled_date, service_record_id, payment_status, description, title, data_origin"),
    supabase.from("services").select("id, appointment_id, customer_id, vehicle_id, service_date, status, description, parts_used, notes, total_cost, oil_quarts_used, payment_status, data_origin"),
    supabase.from("invoices").select("id, customer_id, status, total"),
    supabase.from("sms_logs").select("id, appointment_id, created_at"),
    supabase.from("review_requests").select("id, service_id, status, customer_id"),
    supabase.from("service_inspections").select("id, appointment_id, service_id, status"),
    supabase.from("invoice_line_items").select("id, invoice_id, description, line_total, service_catalog_id, vehicle_id"),
    supabase.from("appointment_services").select("id, appointment_id, name, price, quantity, service_catalog_id"),
  ]);

  const customers = (customersRes.data ?? []) as AuditCustomerRow[];
  const vehicles = (vehiclesRes.data ?? []) as AuditVehicleRow[];
  const appointments = (appointmentsRes.data ?? []) as AuditAppointmentRow[];
  const services = (servicesRes.data ?? []) as AuditServiceRow[];
  const invoices = (invoicesRes.data ?? []) as AuditInvoiceRow[];
  const smsLogs = (smsRes.data ?? []) as AuditSmsLogRow[];
  const reviews = (reviewsRes.data ?? []) as AuditReviewRow[];
  const inspections = (inspectionsRes.data ?? []) as AuditInspectionRow[];
  const invoiceItems = (invoiceItemsRes.data ?? []) as AuditInvoiceItemRow[];
  const appointmentItems = (appointmentItemsRes.data ?? []) as AuditAppointmentItemRow[];

  const appointmentItemsByAppointment = new Map<string, AuditAppointmentItemRow[]>();
  for (const item of appointmentItems) {
    if (!item.appointment_id) continue;
    const list = appointmentItemsByAppointment.get(item.appointment_id) ?? [];
    list.push(item);
    appointmentItemsByAppointment.set(item.appointment_id, list);
  }
  const invoiceItemsByInvoice = new Map<string, AuditInvoiceItemRow[]>();
  for (const item of invoiceItems) {
    if (!item.invoice_id) continue;
    const list = invoiceItemsByInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    invoiceItemsByInvoice.set(item.invoice_id, list);
  }
  const smsAppointmentIds = new Set(smsLogs.map((s) => s.appointment_id).filter(Boolean));
  const reviewServiceIds = new Set(reviews.map((r) => r.service_id).filter(Boolean));
  const inspectionAppointmentIds = new Set(inspections.map((i) => i.appointment_id).filter(Boolean));
  const inspectionServiceIds = new Set(inspections.map((i) => i.service_id).filter(Boolean));
  const serviceIds = new Set(services.map((s) => s.id));
  const vehicleIds = new Set(vehicles.map((v) => v.id));
  const customerIds = new Set(customers.map((c) => c.id));

  const completedAppointments = appointments.filter((a) => a.status === "completed");
  const completedServices = services.filter((s) => s.status === "completed");
  const fakeCustomers = customers.filter((c) => [c.name, c.email, c.phone, c.address].some(isPlaceholderText) || c.data_origin === "demo");
  const fakeVehicles = vehicles.filter((v) => [v.make, v.model, v.vin].some(isPlaceholderText) || v.data_origin === "demo");
  const fakeServices = services.filter((s) => [s.description, s.parts_used, s.notes].some(isPlaceholderText) || s.data_origin === "demo");

  const duplicateCustomers = customers.length - new Set(customers.map((c) => `${String(c.email ?? "").toLowerCase()}|${String(c.phone ?? "").replace(/\D/g, "")}|${String(c.name ?? "").toLowerCase()}`)).size;
  const duplicateVehicles = vehicles.length - new Set(vehicles.map((v) => `${String(v.vin ?? "").toUpperCase()}|${v.customer_id ?? ""}|${v.year ?? ""}|${String(v.make ?? "").toLowerCase()}|${String(v.model ?? "").toLowerCase()}`)).size;
  const completedMissingService = completedAppointments.filter((a) => !a.service_record_id || !serviceIds.has(a.service_record_id)).length;
  const completedWithoutSms = completedAppointments.filter((a) => !smsAppointmentIds.has(a.id)).length;
  const completedWithoutReview = completedAppointments.filter((a) => a.service_record_id && !reviewServiceIds.has(a.service_record_id)).length;
  const completedWithoutInspection = completedAppointments.filter((a) => !inspectionAppointmentIds.has(a.id) && !(a.service_record_id && inspectionServiceIds.has(a.service_record_id))).length;
  const serviceMissingWorkItems = completedServices.filter((s) => !(appointmentItemsByAppointment.get(s.appointment_id ?? "")?.length) && !s.parts_used && !s.notes).length;
  const invoicesNotLinked = invoices.filter((i) => i.status !== "void" && i.status !== "cancelled" && (invoiceItemsByInvoice.get(i.id)?.length ?? 0) === 0).length;

  return {
    placeholderBadDefaults: [
      { label: "Fake/default customer fields", count: fakeCustomers.length, detail: "Customer identity/contact fields contain demo, sample, test, unknown, or placeholder values." },
      { label: "Fake/default vehicle fields", count: fakeVehicles.length, detail: "Vehicle identifiers/spec fields contain demo, sample, test, unknown, or placeholder values." },
      { label: "Fake/default service history", count: fakeServices.length, detail: "Service records contain placeholder/demo text and must not be treated as real history." },
      { label: "Customers without completed service date", count: customers.filter((c) => !c.last_service_date).length, detail: "Show No completed service yet; do not synthesize 999-day ages." },
      { label: "Unranked customer history", count: customers.filter((c) => (Number(c.total_services) || 0) === 0).length, detail: "Show New customer or Unranked until real completed service history exists." },
    ],
    actualBugs: [
      { label: "Completed appointments missing service records", count: completedMissingService, detail: "Appointment completion did not produce or link the service record." },
      { label: "Appointment/service line item mismatches", count: completedServices.filter((s) => (appointmentItemsByAppointment.get(s.appointment_id ?? "")?.length ?? 0) === 0).length, detail: "Completed service records with no source appointment line items." },
      { label: "Invoice/service line item mismatches", count: invoices.filter((i) => (invoiceItemsByInvoice.get(i.id)?.length ?? 0) === 0 && i.status !== "void").length, detail: "Invoices with no invoice line items to reconcile to completed work." },
      { label: "Oil unit conflicts", count: vehicles.filter((v) => /liter|litre|\bl\b/i.test(String(v.oil_capacity ?? ""))).length, detail: "Vehicle oil capacity is stored as liters while completion records oil used in quarts." },
      { label: "Completed records missing inspections", count: completedWithoutInspection, detail: "Completed work has no inspection linked to the appointment or service record." },
      { label: "Completed appointments with no SMS history", count: completedWithoutSms, detail: "No SMS log is linked to the completed appointment." },
      { label: "Completed services with no review request", count: completedWithoutReview, detail: "No review request status is tracked for the completed service." },
    ],
    standardIssues: [
      { label: "Missing VIN", count: vehicles.filter((v) => !v.vin).length, detail: "Vehicle has no VIN on file." },
      { label: "Missing mileage", count: vehicles.filter((v) => !v.mileage).length, detail: "Vehicle has no mileage captured." },
      { label: "Missing oil capacity", count: vehicles.filter((v) => !v.oil_capacity).length, detail: "Vehicle has no oil capacity on file." },
      { label: "Missing oil type", count: vehicles.filter((v) => !v.oil_type).length, detail: "Vehicle has no oil type on file." },
      { label: "Service records missing notes", count: completedServices.filter((s) => !s.notes && !s.description).length, detail: "Completed service has no service notes or description." },
      { label: "Pay-at-service not marked paid", count: completedServices.filter((s) => s.payment_status === "unpaid" || s.payment_status === "partial").length, detail: "Completed work still has unpaid or partial payment status." },
      { label: "Vehicles with no service history", count: vehicles.filter((v) => !completedServices.some((s) => s.vehicle_id === v.id)).length, detail: "Vehicle exists but has no completed service history." },
      { label: "Customers with vehicle but no appointment", count: customers.filter((c) => vehicles.some((v) => v.customer_id === c.id) && !appointments.some((a) => a.customer_id === c.id)).length, detail: "Customer has a vehicle profile but no appointment." },
      { label: "Customers with appointment but no completed service", count: customers.filter((c) => appointments.some((a) => a.customer_id === c.id) && !completedServices.some((s) => s.customer_id === c.id)).length, detail: "Customer has appointment history but no completed service." },
    ],
    productionCleanup: [
      { label: "Records with fake/default values", count: fakeCustomers.length + fakeVehicles.length + fakeServices.length, detail: "Live records polluted by fake/default text.", action: "Convert invalid defaults to null or correct real values." },
      { label: "Impossible dates", count: [...appointments, ...services].filter((r) => auditRecordDate(r) > "2100-01-01").length, detail: "Dates are outside a sane production range.", action: "Convert fake date to null or correct the real date." },
      { label: "Placeholder health tiers", count: customers.filter((c) => isPlaceholderText(c.health_tier) || String(c.health_tier ?? "").toLowerCase() === "bronze" && (Number(c.total_services) || 0) === 0).length, detail: "Customer health is assigned without real completed service history.", action: "Fix customer health status to New customer or Unranked." },
      { label: "Vehicles missing critical data", count: vehicles.filter((v) => !v.vin || !v.mileage || !v.oil_capacity || !v.oil_type).length, detail: "Vehicle profile is missing VIN, mileage, oil capacity, or oil type.", action: "Recalculate vehicle stats and complete missing critical data." },
      { label: "Broken customer/vehicle/appointment links", count: appointments.filter((a) => (a.customer_id && !customerIds.has(a.customer_id)) || (a.vehicle_id && !vehicleIds.has(a.vehicle_id))).length, detail: "Appointment references a missing customer or vehicle.", action: "Repair customer, vehicle, and appointment links." },
      { label: "Duplicate customers", count: Math.max(0, duplicateCustomers), detail: "Customers share matching identity/contact keys.", action: "Merge duplicate customer." },
      { label: "Duplicate vehicles", count: Math.max(0, duplicateVehicles), detail: "Vehicles share matching VIN/customer or year/make/model keys.", action: "Merge duplicate vehicle." },
      { label: "Invoices not linked to completed work", count: invoicesNotLinked, detail: "Invoice is not linked to a completed service or appointment.", action: "Reconcile invoice to service record." },
      { label: "Service records missing work items", count: serviceMissingWorkItems, detail: "Completed service is missing line items, parts, and notes.", action: "Reopen service record for admin correction." },
    ],
  };
}
