import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ApiError } from "@/server/api";

const uuid = z.string().uuid();
const rowSchema = z.record(z.string(), z.unknown());
export const accountExportSchema = z.object({
  exportDate: z.string().min(1),
  userId: uuid,
  email: z.string().email(),
  exportVersion: z.string().min(1),
  data: z.record(z.string(), z.array(rowSchema)),
}).passthrough();

export type AccountExport = z.infer<typeof accountExportSchema>;
export type ImportAction = "created" | "matched" | "skipped" | "failed";

type Mapping = { targetTable: string; targetId: string };
type ImportContext = { supabase: SupabaseClient; user: User; batchId: string; workspaceId: string; mappings: Map<string, Mapping> };

const sourceId = (section: string, row: Record<string, unknown>) => `${section}:${String(row.id ?? "")}`;
const text = (row: Record<string, unknown>, key: string) => typeof row[key] === "string" ? row[key].trim() : "";
const number = (row: Record<string, unknown>, key: string, fallback = 0) => typeof row[key] === "number" && Number.isFinite(row[key]) ? row[key] : fallback;
const nullable = (value: string) => value || null;
const now = () => new Date().toISOString();
const safeDate = (value: unknown, fallback: string) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback;
const normalizeEmail = (row: Record<string, unknown>) => text(row, "email").toLowerCase() || null;
const normalizePhone = (row: Record<string, unknown>) => text(row, "phone").replace(/[^+\d]/g, "") || null;
const sourceHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function firstLast(row: Record<string, unknown>) {
  const first = text(row, "first_name");
  const last = text(row, "last_name");
  const name = text(row, "name");
  if (first || last) return { first_name: first || "Unknown", last_name: last || "Customer" };
  const parts = name.split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || "Unknown", last_name: parts.slice(1).join(" ") || "Customer" };
}

function sourceDate(row: Record<string, unknown>) {
  const date = text(row, "scheduled_date");
  const time = text(row, "scheduled_time") || "09:00";
  return safeDate(date ? `${date}T${time}` : row.created_at, now());
}

function mapAppointmentStatus(value: string) {
  const v = value.toLowerCase();
  if (["cancelled", "canceled"].includes(v)) return "cancelled";
  if (["completed", "complete"].includes(v)) return "completed";
  if (["in_progress", "in progress", "started"].includes(v)) return "in_progress";
  if (["confirmed", "scheduled"].includes(v)) return "confirmed";
  if (["no_show", "no show"].includes(v)) return "no_show";
  return "requested";
}
function mapCustomerStatus(value: string) { return ["inactive", "archived"].includes(value.toLowerCase()) ? value.toLowerCase() : "active"; }
function mapVehicleStatus(value: string) { return ["inactive", "sold", "archived"].includes(value.toLowerCase()) ? value.toLowerCase() : "active"; }
function mapInvoiceStatus(value: string) { return ["issued", "partially_paid", "paid", "void", "past_due"].includes(value.toLowerCase()) ? value.toLowerCase() : "draft"; }
function mapPaymentStatus(value: string) { return ["succeeded", "failed", "refunded", "partially_refunded"].includes(value.toLowerCase()) ? value.toLowerCase() : "pending"; }

async function record(ctx: ImportContext, section: string, row: Record<string, unknown>, result: { action: ImportAction; targetTable?: string; targetId?: string; errorCode?: string; errorMessage?: string }) {
  const { error } = await ctx.supabase.from("account_import_records").upsert({
    batch_id: ctx.batchId, workspace_id: ctx.workspaceId, source_section: section, source_id: String(row.id ?? ""),
    target_table: result.targetTable ?? null, target_id: result.targetId ?? null, action: result.action, status: result.action === "failed" ? "failed" : "committed",
    source_row: row, error_code: result.errorCode ?? null, error_message: result.errorMessage ?? null,
  }, { onConflict: "batch_id,source_section,source_id" });
  if (error) throw error;
  if (result.targetTable && result.targetId) {
    const { error: mappingError } = await ctx.supabase.from("account_import_mappings").upsert({ batch_id: ctx.batchId, workspace_id: ctx.workspaceId, source_section: section, source_id: String(row.id ?? ""), target_table: result.targetTable, target_id: result.targetId }, { onConflict: "batch_id,source_section,source_id" });
    if (mappingError) throw mappingError;
    ctx.mappings.set(sourceId(section, row), { targetTable: result.targetTable, targetId: result.targetId });
  }
}

async function existingMapping(ctx: ImportContext, section: string, row: Record<string, unknown>) {
  const key = sourceId(section, row);
  if (ctx.mappings.has(key)) return ctx.mappings.get(key)!;
  const { data } = await ctx.supabase.from("account_import_mappings").select("target_table,target_id").eq("workspace_id", ctx.workspaceId).eq("source_section", section).eq("source_id", String(row.id ?? "")).maybeSingle();
  if (data) { const mapped = { targetTable: data.target_table, targetId: data.target_id }; ctx.mappings.set(key, mapped); return mapped; }
  return null;
}

async function insertMapped(ctx: ImportContext, section: string, row: Record<string, unknown>, targetTable: string, payload: Record<string, unknown>, match?: { table: string; column: string; value: string | null }) {
  const previous = await existingMapping(ctx, section, row);
  if (previous) { await record(ctx, section, row, { action: "matched", targetTable: previous.targetTable, targetId: previous.targetId }); return previous.targetId; }
  if (match?.value) {
    const { data: existing } = await ctx.supabase.from(match.table).select("id").eq("workspace_id", ctx.workspaceId).eq(match.column, match.value).limit(1).maybeSingle();
    if (existing?.id) { await record(ctx, section, row, { action: "matched", targetTable: match.table, targetId: existing.id }); return existing.id; }
  }
  const { data, error } = await ctx.supabase.from(targetTable).insert({ ...payload, workspace_id: ctx.workspaceId }).select("id").single();
  if (error || !data?.id) throw error ?? new Error(`Unable to create ${targetTable}`);
  await record(ctx, section, row, { action: "created", targetTable, targetId: data.id });
  return data.id as string;
}

async function importCustomer(ctx: ImportContext, row: Record<string, unknown>) {
  const names = firstLast(row);
  return insertMapped(ctx, "customers", row, "customers", { ...names, status: mapCustomerStatus(text(row, "status")), company_name: nullable(text(row, "company_name")), email: normalizeEmail(row), phone: normalizePhone(row), address_line1: nullable(text(row, "address")), notes: nullable(text(row, "notes")), created_by: ctx.user.id, created_at: safeDate(row.created_at, now()), updated_at: safeDate(row.updated_at, now()), country_code: "US" }, { table: "customers", column: "email", value: normalizeEmail(row) });
}

async function importServiceCatalog(ctx: ImportContext, row: Record<string, unknown>) {
  return insertMapped(ctx, "service_catalog", row, "service_catalog", { name: text(row, "name") || "Imported service", description: nullable(text(row, "description")), category: nullable(text(row, "category") || text(row, "service_type")), estimated_minutes: number(row, "estimated_minutes", 0) || null, labor_price: number(row, "default_price", number(row, "total_cost", 0)), is_active: row.is_active !== false, created_at: safeDate(row.created_at, now()), updated_at: safeDate(row.updated_at, now()) }, { table: "service_catalog", column: "name", value: text(row, "name") || null });
}

async function importVehicle(ctx: ImportContext, row: Record<string, unknown>) {
  const customer = ctx.mappings.get(sourceId("customers", { id: row.customer_id }));
  if (!customer) throw new ApiError(422, "Vehicle references a customer that was not imported", "orphan_customer");
  return insertMapped(ctx, "vehicles", row, "vehicles", { customer_id: customer.targetId, status: mapVehicleStatus(text(row, "status")), vin: nullable(text(row, "vin")), year: number(row, "year", 0) || null, make: nullable(text(row, "make")), model: nullable(text(row, "model")), trim: nullable(text(row, "trim")), license_plate: nullable(text(row, "license_plate")), plate_region: nullable(text(row, "plate_region")), color: nullable(text(row, "color")), mileage: number(row, "mileage", 0) || null, mileage_unit: "mi", notes: nullable(text(row, "notes")), created_at: safeDate(row.created_at, now()), updated_at: safeDate(row.updated_at, now()) }, { table: "vehicles", column: "vin", value: text(row, "vin") || null });
}

export async function createImportBatch(args: { supabase: SupabaseClient; user: User; workspaceId: string; fileName: string; input: unknown }) {
  const parsed = accountExportSchema.safeParse(args.input);
  if (!parsed.success) throw new ApiError(400, "Unsupported or invalid account export", "invalid_export");
  const { data, error } = await args.supabase.from("account_import_batches").insert({ workspace_id: args.workspaceId, created_by: args.user.id, source_version: parsed.data.exportVersion, source_file_name: args.fileName, source_sha256: sourceHash(args.input), status: "staged", dry_run: true, total_records: Object.values(parsed.data.data).reduce((sum, rows) => sum + rows.length, 0) }).select("id,status,total_records,created_at").single();
  if (error || !data) throw error ?? new Error("Unable to create import batch");
  return { batch: data, exportData: parsed.data };
}

async function importAppointment(ctx: ImportContext, row: Record<string, unknown>) {
  // Historical entries without a linked customer or vehicle are valid records,
  // not demo data. Preserve them as unlinked appointments instead of dropping
  // the entire row during import.
  const customer = row.customer_id ? ctx.mappings.get(sourceId("customers", { id: row.customer_id })) : null;
  if (row.customer_id && !customer) throw new ApiError(422, "Appointment references a customer that was not imported", "orphan_customer");
  const vehicle = row.vehicle_id ? ctx.mappings.get(sourceId("vehicles", { id: row.vehicle_id })) : null;
  if (row.vehicle_id && !vehicle) throw new ApiError(422, "Appointment references a vehicle that was not imported", "orphan_vehicle");
  const startsAt = sourceDate(row);
  const duration = Math.max(15, number(row, "duration_minutes", 60));
  const endsAt = new Date(Date.parse(startsAt) + duration * 60000).toISOString();
  const metadata = {
    title: nullable(text(row, "title")),
    description: nullable(text(row, "description")),
    guest_name: nullable(text(row, "guest_name")),
    guest_email: normalizeEmail(row),
    guest_phone: normalizePhone(row),
    service_catalog_id: nullable(text(row, "service_catalog_id")),
    location_address: nullable(text(row, "location_address")),
    legacy_payment_status: nullable(text(row, "payment_status")),
    legacy_dispatch_status: nullable(text(row, "dispatch_status")),
    legacy_source_id: String(row.id ?? ""),
  };
  return insertMapped(ctx, "appointments", row, "appointments", { customer_id: customer?.targetId ?? null, vehicle_id: vehicle?.targetId ?? null, location_id: null, assigned_user_id: null, status: mapAppointmentStatus(text(row, "status")), starts_at: startsAt, ends_at: endsAt, source: "import", confirmation_code: nullable(text(row, "confirmation_code")), notes: nullable(text(row, "notes") || text(row, "description")), metadata, created_by: ctx.user.id, created_at: safeDate(row.created_at, now()), updated_at: safeDate(row.updated_at, now()) });
}

async function importServiceRecord(ctx: ImportContext, row: Record<string, unknown>) {
  const customer = ctx.mappings.get(sourceId("customers", { id: row.customer_id }));
  if (!customer) throw new ApiError(422, "Service references a customer that was not imported", "orphan_customer");
  const vehicle = row.vehicle_id ? ctx.mappings.get(sourceId("vehicles", { id: row.vehicle_id })) : null;
  const appointment = row.appointment_id ? ctx.mappings.get(sourceId("appointments", { id: row.appointment_id })) : null;
  return insertMapped(ctx, "services", row, "service_records", { appointment_id: appointment?.targetId ?? null, work_order_id: null, technician_id: null, completed_by: ctx.user.id, status: text(row, "status") || "completed", complaint: nullable(text(row, "description")), diagnosis: null, work_performed: nullable(text(row, "description") || text(row, "service_type")), oil_quarts_used: null, customer_notes: nullable(text(row, "notes")), internal_notes: null, metadata: { source: "lovable_account_export", source_id: String(row.id ?? ""), customer_id: customer.targetId, vehicle_id: vehicle?.targetId ?? null }, started_at: safeDate(row.service_date || row.created_at, now()), completed_at: safeDate(row.service_date || row.updated_at, now()), created_at: safeDate(row.created_at, now()), updated_at: safeDate(row.updated_at, now()), quote_id: null, subtotal: number(row, "total_cost", 0), tax_rate: null, tax_amount: null, discount_amount: 0, total_amount: number(row, "total_cost", 0), currency_code: "USD" });
}

async function importInvoice(ctx: ImportContext, row: Record<string, unknown>) {
  const customer = row.customer_id ? ctx.mappings.get(sourceId("customers", { id: row.customer_id })) : null;
  if (!customer) throw new ApiError(422, "Invoice references a customer that was not imported", "orphan_customer");
  const vehicle = row.vehicle_id ? ctx.mappings.get(sourceId("vehicles", { id: row.vehicle_id })) : null;
  const total = number(row, "total", number(row, "amount", 0));
  return insertMapped(ctx, "invoices", row, "invoices", { customer_id: customer.targetId, vehicle_id: vehicle?.targetId ?? null, work_order_id: null, status: mapInvoiceStatus(text(row, "status")), invoice_number: Math.max(1, Math.trunc(number(row, "invoice_number", 900000000))), subtotal: number(row, "subtotal", total), tax_total: number(row, "tax_amount", number(row, "tax_total", 0)), total, amount_paid: number(row, "amount_paid", 0), due_at: safeDate(row.due_date, now()), issued_at: safeDate(row.issue_date || row.created_at, now()), created_by: ctx.user.id, created_at: safeDate(row.created_at, now()), updated_at: safeDate(row.updated_at, now()) });
}

async function importPayment(ctx: ImportContext, row: Record<string, unknown>) {
  const appointment = row.appointment_id ? ctx.mappings.get(sourceId("appointments", { id: row.appointment_id })) : null;
  let customerId: string | null = null;
  if (appointment) {
    const { data } = await ctx.supabase.from("appointments").select("customer_id").eq("workspace_id", ctx.workspaceId).eq("id", appointment.targetId).maybeSingle();
    customerId = data?.customer_id ?? null;
  }
  return insertMapped(ctx, "payment_records", row, "payments", { invoice_id: null, customer_id: customerId, provider: null, provider_payment_id: null, status: mapPaymentStatus(text(row, "status")), amount: number(row, "amount", number(row, "total", 0)), currency_code: "USD", paid_at: safeDate(row.created_at, now()), created_by: ctx.user.id, created_at: safeDate(row.created_at, now()), updated_at: safeDate(row.updated_at, now()) });
}

export async function executeImportBatch(ctx: ImportContext, input: AccountExport) {
  const rows = input.data;
  const counts = { created: 0, matched: 0, skipped: 0, failed: 0 };
  const sections: Array<[string, (row: Record<string, unknown>) => Promise<string>]> = [
    ["customers", (row) => importCustomer(ctx, row)],
    ["vehicles", (row) => importVehicle(ctx, row)],
    ["service_catalog", (row) => importServiceCatalog(ctx, row)],
    ["appointments", (row) => importAppointment(ctx, row)],
    ["services", (row) => importServiceRecord(ctx, row)],
    ["invoices", (row) => importInvoice(ctx, row)],
    ["payment_records", (row) => importPayment(ctx, row)],
  ];
  for (const [section, importer] of sections) {
    for (const row of rows[section] ?? []) {
      try { await importer(row); counts.created += 1; } catch (cause) { counts.failed += 1; await record(ctx, section, row, { action: "failed", errorCode: cause instanceof ApiError ? cause.code : "import_error", errorMessage: cause instanceof Error ? cause.message : "Unable to import row" }); }
    }
  }
  for (const section of Object.keys(rows)) {
    if (!["customers", "vehicles", "service_catalog", "appointments", "services", "invoices", "payment_records"].includes(section) && (rows[section]?.length ?? 0) > 0) {
      for (const row of rows[section]) { counts.skipped += 1; await record(ctx, section, row, { action: "skipped", errorCode: "unsupported_target", errorMessage: "This entity is staged for a subsequent target-specific importer." }); }
    }
  }
  const finalStatus = counts.failed ? "completed_with_errors" : "completed";
  const { error } = await ctx.supabase.from("account_import_batches").update({ status: finalStatus, dry_run: false, imported_records: counts.created, skipped_records: counts.skipped, failed_records: counts.failed, completed_at: now(), error_summary: counts.failed ? [{ code: "row_failures", count: counts.failed }] : [] }).eq("id", ctx.batchId).eq("workspace_id", ctx.workspaceId);
  if (error) throw error;
  return { status: finalStatus, counts };
}

export async function rollbackImportBatch(ctx: ImportContext) {
  const { data: batch, error: batchError } = await ctx.supabase.from("account_import_batches").select("id,status").eq("id", ctx.batchId).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (batchError) throw batchError;
  if (!batch) throw new ApiError(404, "Import batch not found", "not_found");
  if (!["completed", "completed_with_errors"].includes(batch.status)) throw new ApiError(409, "Only completed import batches can be rolled back", "invalid_batch_state");
  const { data: records, error } = await ctx.supabase.from("account_import_records").select("id,target_table,target_id,action,status").eq("batch_id", ctx.batchId).eq("workspace_id", ctx.workspaceId).eq("action", "created").eq("status", "committed").order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;
  let deleted = 0;
  for (const row of records ?? []) {
    if (!row.target_table || !row.target_id) continue;
    if (!["customers", "vehicles", "service_catalog", "appointments", "service_records", "invoices", "payments"].includes(row.target_table)) continue;
    const { error: deleteError } = await ctx.supabase.from(row.target_table).delete().eq("id", row.target_id).eq("workspace_id", ctx.workspaceId);
    if (deleteError) throw deleteError;
    await ctx.supabase.from("account_import_records").update({ status: "rolled_back" }).eq("id", row.id).eq("workspace_id", ctx.workspaceId);
    deleted += 1;
  }
  const { error: updateError } = await ctx.supabase.from("account_import_batches").update({ status: "rolled_back", rolled_back_at: now() }).eq("id", ctx.batchId).eq("workspace_id", ctx.workspaceId);
  if (updateError) throw updateError;
  return { status: "rolled_back", deleted };
}
