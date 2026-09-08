/** Canonical reports and production data-quality audit. */
import { productionSupabase } from "@/integrations/supabase/client";
import { format, startOfYear, subDays } from "date-fns";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { fetchCanonicalCashReceipts, type CanonicalCashReceipt } from "@/application/queries/canonical-cash-receipts.query";

export interface ReportsKpi {
  collected: number;
  collectedPrev: number;
  billed: number;
  outstanding: number;
  refunds: number;
  taxCollected: number;
  ytdCollected: number;
  ytdBilled: number;
  jobsCompleted: number;
  jobsTotal: number;
  jobsCancelled: number;
  appointmentsBooked: number;
  appointmentsNoShow: number;
  avgTicket: number;
  avgDurationMin: number;
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  totalVehicles: number;
  uniqueServiceCustomers: number;
  revenueByServiceType: Array<{ type: string; revenue: number; count: number }>;
  revenueByPaymentMethod: Array<{ method: string; revenue: number; count: number }>;
  topMakes: Array<{ make: string; count: number }>;
  topZips: Array<{ zip: string; jobs: number; revenue: number }>;
  dailyRevenue: Array<{ date: string; collected: number; billed: number }>;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  legacyExcluded: number;
}

export interface ReportsRange {
  from: Date;
  to: Date;
  label: string;
}

type JsonObject = Record<string, unknown>;

interface InvoiceRow {
  id: string;
  customer_id: string | null;
  status: string;
  subtotal: number | string | null;
  tax_total: number | string | null;
  total: number | string | null;
  amount_paid: number | string | null;
  issued_at: string | null;
  created_at: string;
  metadata: unknown;
}

interface ServiceRecordRow {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_amount: number | string | null;
  metadata: unknown;
}

interface AppointmentRow {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  status: string;
  starts_at: string;
  metadata: unknown;
}

interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  created_at: string;
  metadata: unknown;
}

interface VehicleRow {
  id: string;
  customer_id: string | null;
  vin: string | null;
  mileage: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  metadata: unknown;
}

interface InvoiceLineRow {
  invoice_id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function origin(metadata: unknown): string | null {
  const meta = object(metadata);
  const value = meta.data_origin ?? meta.origin;
  return value == null ? null : String(value);
}

function isLegacy(metadata: unknown): boolean {
  return origin(metadata) === "legacy_import";
}

function dollars(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function paymentMethod(receipt: CanonicalCashReceipt): string {
  const meta = object(receipt.metadata);
  return String(meta.payment_method ?? meta.payment_type ?? receipt.payment_type ?? receipt.payment_provider ?? "other");
}

function settledNet(receipt: CanonicalCashReceipt): number {
  return Math.max(receipt.net_collected_cents, 0) / 100;
}

function dateKey(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export async function fetchReportsCanonical(
  range: ReportsRange,
  includeLegacy = false,
): Promise<ReportsKpi> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before viewing reports.");
  const workspaceId = context.workspaceId;

  const fromDate = format(range.from, "yyyy-MM-dd");
  const toDate = format(range.to, "yyyy-MM-dd");
  const fromIso = `${fromDate}T00:00:00`;
  const toIso = `${toDate}T23:59:59`;
  const periodDays = Math.max(Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000), 1);
  const prevFrom = format(subDays(range.from, periodDays), "yyyy-MM-dd");
  const prevTo = format(subDays(range.from, 1), "yyyy-MM-dd");
  const ytdFrom = format(startOfYear(new Date()), "yyyy-MM-dd");

  const [
    receiptsRes,
    receiptsPrevRes,
    receiptsYtdRes,
    invoicesRes,
    openInvoicesRes,
    invoicesYtdRes,
    serviceRecordsRes,
    appointmentsRes,
    customersRes,
    vehiclesRes,
    invoiceLinesRes,
  ] = await Promise.all([
    fetchCanonicalCashReceipts({ workspaceId, from: fromIso, to: toIso }),
    fetchCanonicalCashReceipts({ workspaceId, from: `${prevFrom}T00:00:00`, to: `${prevTo}T23:59:59` }),
    fetchCanonicalCashReceipts({ workspaceId, from: `${ytdFrom}T00:00:00` }),
    productionSupabase
      .from("invoices")
      .select("id,customer_id,status,subtotal,tax_total,total,amount_paid,issued_at,created_at,metadata")
      .eq("workspace_id", workspaceId)
      .in("status", ["issued", "partially_paid", "paid", "past_due"])
      .gte("issued_at", fromIso)
      .lte("issued_at", toIso),
    productionSupabase
      .from("invoices")
      .select("id,customer_id,status,subtotal,tax_total,total,amount_paid,issued_at,created_at,metadata")
      .eq("workspace_id", workspaceId)
      .in("status", ["issued", "partially_paid", "past_due"])
      .lte("created_at", toIso),
    productionSupabase
      .from("invoices")
      .select("id,customer_id,status,subtotal,tax_total,total,amount_paid,issued_at,created_at,metadata")
      .eq("workspace_id", workspaceId)
      .in("status", ["issued", "partially_paid", "paid", "past_due"])
      .gte("issued_at", `${ytdFrom}T00:00:00`),
    productionSupabase
      .from("service_records")
      .select("id,customer_id,vehicle_id,status,started_at,completed_at,total_amount,metadata")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .gte("completed_at", fromIso)
      .lte("completed_at", toIso),
    productionSupabase
      .from("appointments")
      .select("id,customer_id,vehicle_id,status,starts_at,metadata")
      .eq("workspace_id", workspaceId)
      .gte("starts_at", fromIso)
      .lte("starts_at", toIso),
    productionSupabase
      .from("customers")
      .select("id,first_name,last_name,company_name,email,phone,postal_code,created_at,metadata")
      .eq("workspace_id", workspaceId),
    productionSupabase
      .from("vehicles")
      .select("id,customer_id,vin,mileage,year,make,model,metadata")
      .eq("workspace_id", workspaceId),
    productionSupabase
      .from("invoice_lines")
      .select("invoice_id,description,quantity,unit_price")
      .eq("workspace_id", workspaceId),
  ]);

  for (const result of [receiptsRes, receiptsPrevRes, receiptsYtdRes]) {
    if (result.error) throw result.error;
  }
  for (const result of [invoicesRes, openInvoicesRes, invoicesYtdRes, serviceRecordsRes, appointmentsRes, customersRes, vehiclesRes, invoiceLinesRes]) {
    if (result.error) throw result.error;
  }

  const allReceipts = receiptsRes.data;
  const allInvoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const allServiceRecords = (serviceRecordsRes.data ?? []) as ServiceRecordRow[];
  const allAppointments = (appointmentsRes.data ?? []) as AppointmentRow[];
  const allCustomers = (customersRes.data ?? []) as CustomerRow[];
  const allVehicles = (vehiclesRes.data ?? []) as VehicleRow[];

  const receipts = includeLegacy ? allReceipts : allReceipts.filter((row) => row.data_origin !== "legacy_import");
  const receiptsPrev = includeLegacy ? receiptsPrevRes.data : receiptsPrevRes.data.filter((row) => row.data_origin !== "legacy_import");
  const receiptsYtd = includeLegacy ? receiptsYtdRes.data : receiptsYtdRes.data.filter((row) => row.data_origin !== "legacy_import");
  const invoices = includeLegacy ? allInvoices : allInvoices.filter((row) => !isLegacy(row.metadata));
  const invoicesYtd = ((invoicesYtdRes.data ?? []) as InvoiceRow[]).filter((row) => includeLegacy || !isLegacy(row.metadata));
  const openInvoices = ((openInvoicesRes.data ?? []) as InvoiceRow[]).filter((row) => includeLegacy || !isLegacy(row.metadata));
  const serviceRecords = includeLegacy ? allServiceRecords : allServiceRecords.filter((row) => !isLegacy(row.metadata));
  const appointments = includeLegacy ? allAppointments : allAppointments.filter((row) => !isLegacy(row.metadata));
  const customers = includeLegacy ? allCustomers : allCustomers.filter((row) => !isLegacy(row.metadata));
  const vehicles = includeLegacy ? allVehicles : allVehicles.filter((row) => !isLegacy(row.metadata));

  const legacyExcluded =
    allReceipts.filter((row) => row.data_origin === "legacy_import").length +
    allInvoices.filter((row) => isLegacy(row.metadata)).length +
    allServiceRecords.filter((row) => isLegacy(row.metadata)).length +
    allAppointments.filter((row) => isLegacy(row.metadata)).length;

  const collected = receipts.reduce((sum, row) => sum + settledNet(row), 0);
  const collectedPrev = receiptsPrev.reduce((sum, row) => sum + settledNet(row), 0);
  const refunds = receipts.reduce((sum, row) => sum + row.refunded_cents / 100, 0);
  const taxCollected = receipts.reduce((sum, row) => sum + row.tax_amount / 100, 0);
  const ytdCollected = receiptsYtd.reduce((sum, row) => sum + settledNet(row), 0);
  const billed = invoices.reduce((sum, row) => sum + dollars(row.total), 0);
  const ytdBilled = invoicesYtd.reduce((sum, row) => sum + dollars(row.total), 0);
  const outstanding = openInvoices.reduce(
    (sum, row) => sum + Math.max(dollars(row.total) - dollars(row.amount_paid), 0),
    0,
  );

  const completed = serviceRecords;
  const cancelled = appointments.filter((row) => row.status === "cancelled");
  const noShow = appointments.filter((row) => row.status === "no_show");
  const durations = completed
    .map((row) => {
      if (!row.started_at || !row.completed_at) return 0;
      const start = new Date(row.started_at).getTime();
      const end = new Date(row.completed_at).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? Math.round((end - start) / 60_000)
        : 0;
    })
    .filter((value) => value > 0);
  const avgDurationMin = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;

  const newCustomers = customers.filter((row) => {
    const created = new Date(row.created_at).getTime();
    return created >= range.from.getTime() && created <= range.to.getTime();
  }).length;

  const completedByCustomer = new Map<string, number>();
  for (const row of completed) {
    if (!row.customer_id) continue;
    completedByCustomer.set(row.customer_id, (completedByCustomer.get(row.customer_id) ?? 0) + 1);
  }
  const repeatCustomers = Array.from(completedByCustomer.values()).filter((count) => count >= 2).length;
  const uniqueServiceCustomers = completedByCustomer.size;

  const currentInvoiceIds = new Set(invoices.map((row) => row.id));
  const typeMap = new Map<string, { revenue: number; count: number }>();
  for (const line of (invoiceLinesRes.data ?? []) as InvoiceLineRow[]) {
    if (!currentInvoiceIds.has(line.invoice_id)) continue;
    const type = line.description || "Service";
    const current = typeMap.get(type) ?? { revenue: 0, count: 0 };
    current.revenue += dollars(line.quantity) * dollars(line.unit_price);
    current.count += 1;
    typeMap.set(type, current);
  }
  const revenueByServiceType = Array.from(typeMap.entries())
    .map(([type, values]) => ({ type, ...values }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  const methodMap = new Map<string, { revenue: number; count: number }>();
  for (const receipt of receipts) {
    const method = paymentMethod(receipt);
    const current = methodMap.get(method) ?? { revenue: 0, count: 0 };
    current.revenue += settledNet(receipt);
    current.count += 1;
    methodMap.set(method, current);
  }
  const revenueByPaymentMethod = Array.from(methodMap.entries())
    .map(([method, values]) => ({ method, ...values }))
    .sort((a, b) => b.revenue - a.revenue);

  const makeMap = new Map<string, number>();
  for (const vehicle of vehicles) {
    if (!vehicle.make) continue;
    makeMap.set(vehicle.make, (makeMap.get(vehicle.make) ?? 0) + 1);
  }
  const topMakes = Array.from(makeMap.entries())
    .map(([make, count]) => ({ make, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const customerZip = new Map(customers.map((row) => [row.id, row.postal_code]));
  const zipMap = new Map<string, { jobs: number; revenue: number }>();
  for (const record of completed) {
    const zip = record.customer_id ? customerZip.get(record.customer_id) : null;
    if (!zip) continue;
    const current = zipMap.get(zip) ?? { jobs: 0, revenue: 0 };
    current.jobs += 1;
    current.revenue += dollars(record.total_amount);
    zipMap.set(zip, current);
  }
  const topZips = Array.from(zipMap.entries())
    .map(([zip, values]) => ({ zip, ...values }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const dailyMap = new Map<string, { collected: number; billed: number }>();
  for (const receipt of receipts) {
    const key = dateKey(receipt.collected_at);
    if (!key) continue;
    const current = dailyMap.get(key) ?? { collected: 0, billed: 0 };
    current.collected += settledNet(receipt);
    dailyMap.set(key, current);
  }
  for (const invoice of invoices) {
    const key = dateKey(invoice.issued_at ?? invoice.created_at);
    if (!key) continue;
    const current = dailyMap.get(key) ?? { collected: 0, billed: 0 };
    current.billed += dollars(invoice.total);
    dailyMap.set(key, current);
  }
  const dailyRevenue = Array.from(dailyMap.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    collected,
    collectedPrev,
    billed,
    outstanding,
    refunds,
    taxCollected,
    ytdCollected,
    ytdBilled,
    jobsCompleted: completed.length,
    jobsTotal: appointments.length,
    jobsCancelled: cancelled.length,
    appointmentsBooked: appointments.length,
    appointmentsNoShow: noShow.length,
    avgTicket: completed.length ? billed / completed.length : 0,
    avgDurationMin,
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

export interface ServiceWriterAuditResult {
  placeholderBadDefaults: Array<{ label: string; count: number; detail: string }>;
  actualBugs: Array<{ label: string; count: number; detail: string }>;
  standardIssues: Array<{ label: string; count: number; detail: string }>;
  productionCleanup: Array<{ label: string; count: number; detail: string; action: string }>;
}

function placeholder(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return Boolean(text) && (/^(placeholder|sample|demo|test|unknown|n\/a|none)$/i.test(text) || text.includes("demo.com"));
}

export async function fetchServiceWriterAudit(): Promise<ServiceWriterAuditResult> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before running the production audit.");
  const workspaceId = context.workspaceId;

  const [customersRes, vehiclesRes, appointmentsRes, serviceRecordsRes, invoicesRes, invoiceLinesRes, paymentsRes] = await Promise.all([
    productionSupabase
      .from("customers")
      .select("id,first_name,last_name,company_name,email,phone,postal_code,created_at,metadata")
      .eq("workspace_id", workspaceId),
    productionSupabase
      .from("vehicles")
      .select("id,customer_id,vin,mileage,year,make,model,metadata")
      .eq("workspace_id", workspaceId),
    productionSupabase
      .from("appointments")
      .select("id,customer_id,vehicle_id,status,starts_at,metadata")
      .eq("workspace_id", workspaceId),
    productionSupabase
      .from("service_records")
      .select("id,appointment_id,customer_id,vehicle_id,status,started_at,completed_at,work_performed,total_amount,metadata")
      .eq("workspace_id", workspaceId),
    productionSupabase
      .from("invoices")
      .select("id,customer_id,vehicle_id,work_order_id,status,total,amount_paid,due_at,created_at,metadata")
      .eq("workspace_id", workspaceId),
    productionSupabase
      .from("invoice_lines")
      .select("id,invoice_id,description,quantity,unit_price")
      .eq("workspace_id", workspaceId),
    productionSupabase
      .from("payments")
      .select("id,invoice_id,customer_id,status,amount,paid_at,metadata")
      .eq("workspace_id", workspaceId),
  ]);

  for (const result of [customersRes, vehiclesRes, appointmentsRes, serviceRecordsRes, invoicesRes, invoiceLinesRes, paymentsRes]) {
    if (result.error) throw result.error;
  }

  const customers = (customersRes.data ?? []) as CustomerRow[];
  const vehicles = (vehiclesRes.data ?? []) as VehicleRow[];
  const appointments = (appointmentsRes.data ?? []) as AppointmentRow[];
  const serviceRecords = (serviceRecordsRes.data ?? []) as Array<ServiceRecordRow & { appointment_id?: string | null; work_performed?: string | null }>;
  const invoices = (invoicesRes.data ?? []) as Array<InvoiceRow & { vehicle_id?: string | null; work_order_id?: string | null; due_at?: string | null }>;
  const invoiceLines = invoiceLinesRes.data ?? [];
  const payments = paymentsRes.data ?? [];

  const customerIds = new Set(customers.map((row) => row.id));
  const vehicleIds = new Set(vehicles.map((row) => row.id));
  const serviceByAppointment = new Set(serviceRecords.map((row) => row.appointment_id).filter(Boolean));
  const invoiceIdsWithLines = new Set(invoiceLines.map((row) => row.invoice_id));
  const completedServices = serviceRecords.filter((row) => row.status === "completed");

  const fakeCustomers = customers.filter((row) =>
    [row.first_name, row.last_name, row.company_name, row.email, row.phone].some(placeholder),
  );
  const fakeVehicles = vehicles.filter((row) => [row.vin, row.make, row.model].some(placeholder));
  const fakeServices = serviceRecords.filter((row) => [row.work_performed, object(row.metadata).service_name].some(placeholder));

  const duplicateCustomers = Math.max(
    0,
    customers.length - new Set(customers.map((row) =>
      `${String(row.email ?? "").toLowerCase()}|${String(row.phone ?? "").replace(/\D/g, "")}|${String(row.first_name ?? "").toLowerCase()}|${String(row.last_name ?? "").toLowerCase()}`,
    )).size,
  );
  const duplicateVehicles = Math.max(
    0,
    vehicles.length - new Set(vehicles.map((row) => String(row.vin ?? "").trim().toUpperCase()).filter(Boolean)).size,
  );

  const completedAppointmentsMissingService = appointments.filter(
    (row) => row.status === "completed" && !serviceByAppointment.has(row.id),
  ).length;
  const invoicesWithoutLines = invoices.filter(
    (row) => row.status !== "void" && !invoiceIdsWithLines.has(row.id),
  ).length;
  const servicesMissingWork = completedServices.filter(
    (row) => !String(row.work_performed ?? "").trim() && !String(object(row.metadata).service_name ?? "").trim(),
  ).length;
  const brokenAppointmentLinks = appointments.filter(
    (row) => (row.customer_id && !customerIds.has(row.customer_id)) || (row.vehicle_id && !vehicleIds.has(row.vehicle_id)),
  ).length;
  const overpaidInvoices = invoices.filter((row) => dollars(row.amount_paid) > dollars(row.total) + 0.01).length;
  const succeededWithoutPaidAt = payments.filter((row) => row.status === "succeeded" && !row.paid_at).length;

  const impossibleDates = [
    ...appointments.map((row) => row.starts_at),
    ...serviceRecords.map((row) => row.completed_at),
    ...invoices.map((row) => row.created_at),
  ].filter((value) => value && value > "2100-01-01").length;

  return {
    placeholderBadDefaults: [
      { label: "Fake/default customer fields", count: fakeCustomers.length, detail: "Customer identity/contact fields contain placeholder or demo values." },
      { label: "Fake/default vehicle fields", count: fakeVehicles.length, detail: "Vehicle identity fields contain placeholder or demo values." },
      { label: "Fake/default completed work", count: fakeServices.length, detail: "Service history contains placeholder or demo work descriptions." },
    ],
    actualBugs: [
      { label: "Completed appointments missing service records", count: completedAppointmentsMissingService, detail: "Completed appointments must have a canonical service record." },
      { label: "Invoices without line items", count: invoicesWithoutLines, detail: "Non-void invoices must reconcile to invoice lines." },
      { label: "Completed services missing work performed", count: servicesMissingWork, detail: "Completed service records need durable work evidence." },
      { label: "Broken customer/vehicle appointment links", count: brokenAppointmentLinks, detail: "Appointments reference missing workspace customers or vehicles." },
      { label: "Overpaid invoices", count: overpaidInvoices, detail: "Invoice amount_paid exceeds total." },
      { label: "Succeeded payments missing paid_at", count: succeededWithoutPaidAt, detail: "Succeeded payments require a settlement timestamp." },
    ],
    standardIssues: [
      { label: "Missing VIN", count: vehicles.filter((row) => !row.vin).length, detail: "Vehicle has no VIN on file." },
      { label: "Missing mileage", count: vehicles.filter((row) => row.mileage == null).length, detail: "Vehicle has no mileage captured." },
      { label: "Vehicles with no completed service history", count: vehicles.filter((vehicle) => !completedServices.some((service) => service.vehicle_id === vehicle.id)).length, detail: "Vehicle exists without a completed canonical service record." },
      { label: "Customers with no appointment history", count: customers.filter((customer) => !appointments.some((appointment) => appointment.customer_id === customer.id)).length, detail: "Customer exists without an appointment." },
      { label: "Open invoices", count: invoices.filter((row) => ["issued", "partially_paid", "past_due"].includes(row.status)).length, detail: "Invoice balance remains open." },
    ],
    productionCleanup: [
      { label: "Records with fake/default values", count: fakeCustomers.length + fakeVehicles.length + fakeServices.length, detail: "Production records contain placeholder values.", action: "Replace invalid defaults with real values or null." },
      { label: "Impossible dates", count: impossibleDates, detail: "Dates are outside a sane production range.", action: "Correct or null the invalid date." },
      { label: "Duplicate customers", count: duplicateCustomers, detail: "Customers share the same normalized identity/contact key.", action: "Merge duplicate customer records." },
      { label: "Duplicate VINs", count: duplicateVehicles, detail: "Vehicles share the same non-empty VIN.", action: "Merge or correct duplicate vehicle records." },
      { label: "Invoices not linked to line items", count: invoicesWithoutLines, detail: "Invoice has no durable line-item evidence.", action: "Reconcile invoice lines to completed work." },
      { label: "Broken appointment references", count: brokenAppointmentLinks, detail: "Appointment links do not resolve inside the workspace.", action: "Repair customer and vehicle references." },
    ],
  };
}
