import { supabase } from "@/integrations/supabase/client";
import type { JobRuntime } from "@/domain/jobs/job-runtime";
import {
  computeFinancialSummary,
  deriveInvoiceStatus,
  deriveSettlementStatus,
  toCentsFromDollars,
} from "@/domain/financials/canonical-financials";
import { toCents } from "@/lib/financialMath";
import { normalizeJobStatus } from "@/domain/jobs/job-lifecycle";
import { buildTrustContext, type TrustContext } from "@/domain/auth/build-trust-context";
import { canViewFinancials, canViewJob } from "@/domain/auth/job-authorization";
export type { TrustContext } from "@/domain/auth/build-trust-context";

type ChecklistRow = { status: string | null; is_required: boolean | null; step_name: string | null };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function resolveLifecycleStatus(status: string | null | undefined): JobRuntime["lifecycle"]["status"] {
  return normalizeJobStatus(status);
}

function resolvePersistedChecklistStatus(rows: ChecklistRow[]): JobRuntime["execution"]["checklistStatus"] {
  if (!rows.length) return "complete";
  const normalized = rows.map((r) => (r.status ?? "pending").toLowerCase());
  if (normalized.some((s) => s === "blocked" || s === "failed")) return "blocked";
  const requiredPending = rows.filter(
    (r) => r.is_required !== false && (r.status ?? "pending").toLowerCase() !== "completed",
  );
  if (!requiredPending.length) return "complete";
  if (normalized.some((s) => s === "completed" || s === "in_progress")) return "in_progress";
  return "not_started";
}

function resolveBlockingIssues(rows: ChecklistRow[]): string[] {
  return rows
    .filter((r) => ["blocked", "failed"].includes((r.status ?? "").toLowerCase()))
    .map((r) => `Blocked step: ${r.step_name ?? "unnamed step"}`);
}

export async function getJobRuntime(jobId: string, trustContext?: TrustContext): Promise<JobRuntime> {
  const trust = trustContext ?? await buildTrustContext();
  const client = supabase as any;

  const { data: appointment, error } = await client
    .from("appointments")
    .select("id,workspace_id,customer_id,vehicle_id,status,starts_at,ends_at,assigned_user_id,metadata,created_at,updated_at,customers(id,first_name,last_name,phone,email),vehicles(id,vin,year,make,model)")
    .eq("id", jobId)
    .single();
  if (error || !appointment) throw error || new Error("Job not found");

  const [itemsResult, serviceResult, invoiceResult, paymentsResult, checklistResult] = await Promise.all([
    client.from("appointment_items")
      .select("service_catalog_id,description,quantity,unit_price,item_type")
      .eq("workspace_id", appointment.workspace_id)
      .eq("appointment_id", jobId)
      .order("sort_order"),
    client.from("service_records")
      .select("id,subtotal,tax_amount,total_amount,status,started_at,completed_at,metadata")
      .eq("workspace_id", appointment.workspace_id)
      .eq("appointment_id", jobId)
      .neq("status", "voided")
      .maybeSingle(),
    client.from("invoices")
      .select("id,status,subtotal,tax_total,total,amount_paid,metadata")
      .eq("workspace_id", appointment.workspace_id)
      .eq("metadata->>appointment_id", jobId)
      .neq("status", "void")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    client.from("payments")
      .select("amount,status,metadata")
      .eq("workspace_id", appointment.workspace_id)
      .eq("metadata->>appointment_id", jobId),
    client.from("job_execution_checklists")
      .select("status,is_required,step_name")
      .eq("job_id", jobId)
      .eq("job_source", "appointment"),
  ]);

  for (const result of [itemsResult, serviceResult, invoiceResult, paymentsResult, checklistResult]) {
    if (result.error) throw result.error;
  }

  const metadata = object(appointment.metadata);
  const serviceMetadata = object(serviceResult.data?.metadata);
  const items = itemsResult.data ?? [];
  const itemSubtotal = items.reduce(
    (sum: number, row: any) => sum + Number(row.quantity || 0) * Number(row.unit_price || 0),
    0,
  );
  const service = serviceResult.data;
  const invoice = invoiceResult.data;

  // Financial source priority after closeout is invoice -> service record ->
  // appointment items. Historical metadata is a final read-only fallback only.
  const subtotalDollars = Number(invoice?.subtotal ?? service?.subtotal ?? itemSubtotal ?? metadata.estimated_cost ?? 0);
  const taxDollars = Number(invoice?.tax_total ?? service?.tax_amount ?? metadata.tax_amount ?? 0);
  const totalDollars = Number(invoice?.total ?? service?.total_amount ?? (subtotalDollars + taxDollars));
  const subtotalCents = toCentsFromDollars(subtotalDollars);
  const taxCents = toCentsFromDollars(taxDollars);
  const totalCents = toCentsFromDollars(totalDollars);

  const lifecycleStatus = resolveLifecycleStatus(appointment.status);
  const summary = computeFinancialSummary({
    services: [{
      totalDueCents: toCents(totalCents),
      balanceDueCents: toCents(Math.max(totalCents - toCentsFromDollars(Number(invoice?.amount_paid ?? 0)), 0)),
      jobStatus: lifecycleStatus === "completed" ? "completed" : "scheduled",
    }],
    payments: (paymentsResult.data || []).map((p: any) => {
      const paymentMetadata = object(p.metadata);
      const refundedDollars = Number(paymentMetadata.refunded_amount ?? paymentMetadata.refund_amount ?? 0);
      return {
        amountCents: toCentsFromDollars(Number(p.amount || 0)),
        refundAmountCents: toCentsFromDollars(refundedDollars),
        status: p.status || "pending",
      };
    }),
  });

  const checklist = (checklistResult.data ?? []) as ChecklistRow[];
  const customer = Array.isArray(appointment.customers) ? appointment.customers[0] : appointment.customers;
  const vehicle = Array.isArray(appointment.vehicles) ? appointment.vehicles[0] : appointment.vehicles;
  const serviceName = items.find((row: any) => row.item_type === "service")?.description
    ?? String(metadata.title ?? serviceMetadata.service_type ?? "Service");
  const actualStart = String(service?.started_at ?? metadata.actual_start_time ?? "") || undefined;
  const actualEnd = String(service?.completed_at ?? metadata.actual_end_time ?? "") || undefined;

  const visibleToUser = appointment.workspace_id === trust.orgId;
  const editableByUser = visibleToUser && trust.role !== "customer";
  const authorizationShape = {
    id: appointment.id,
    orgId: appointment.workspace_id,
    customer: { id: customer?.id || appointment.customer_id || "", name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") },
    vehicle: { id: vehicle?.id || appointment.vehicle_id || "" },
    service: {},
    lifecycle: { status: lifecycleStatus, updatedAt: appointment.updated_at || appointment.created_at || new Date().toISOString() },
    execution: { checklistStatus: resolvePersistedChecklistStatus(checklist) },
    dispatch: {},
    financials: {
      subtotalCents, taxCents, totalCents, paidCents: summary.collectedCents,
      refundedCents: summary.refundedCents, balanceCents: Math.max(totalCents - summary.collectedCents, 0),
      invoiceStatus: invoice?.status ? String(invoice.status) : "none",
      paymentStatus: deriveSettlementStatus(summary),
    },
    parts: { status: "not_required" as const, required: [] },
    trust: { visibleToUser, editableByUser },
    timestamps: { createdAt: appointment.created_at || "", updatedAt: appointment.updated_at || appointment.created_at || "" },
  } as JobRuntime;
  if (!canViewJob(authorizationShape, trust)) throw new Error("Not authorized to view this job.");

  const runtime: JobRuntime = {
    ...authorizationShape,
    customer: {
      id: customer?.id || appointment.customer_id || "",
      name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Unknown Customer",
      phone: customer?.phone || undefined,
      email: customer?.email || undefined,
    },
    vehicle: {
      id: vehicle?.id || appointment.vehicle_id || "",
      vin: vehicle?.vin || undefined,
      year: vehicle?.year || undefined,
      make: vehicle?.make || undefined,
      model: vehicle?.model || undefined,
    },
    service: {
      appointmentId: appointment.id,
      serviceTypeId: items.find((row: any) => row.service_catalog_id)?.service_catalog_id || undefined,
      serviceName,
    },
    execution: {
      checklistStatus: resolvePersistedChecklistStatus(checklist),
      startedAt: actualStart,
      completedAt: actualEnd,
      blockingIssues: resolveBlockingIssues(checklist),
    },
    dispatch: {
      technicianId: appointment.assigned_user_id || undefined,
      assignedAt: metadata.assigned_at == null ? undefined : String(metadata.assigned_at),
      enRouteAt: metadata.en_route_at == null ? undefined : String(metadata.en_route_at),
      arrivedAt: metadata.arrived_at == null ? undefined : String(metadata.arrived_at),
    },
    financials: {
      subtotalCents,
      taxCents,
      totalCents,
      paidCents: summary.collectedCents,
      refundedCents: summary.refundedCents,
      balanceCents: Math.max(totalCents - summary.collectedCents, 0),
      invoiceStatus: invoice?.status ? String(invoice.status) as JobRuntime["financials"]["invoiceStatus"] : deriveInvoiceStatus(summary),
      paymentStatus: deriveSettlementStatus(summary),
    },
    trust: {
      visibleToUser,
      editableByUser,
      organizationRole: trust.role,
      subscriptionTier: trust.subscriptionTier,
    },
  };

  if (!canViewFinancials(runtime, trust)) {
    runtime.financials = {
      ...runtime.financials,
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      paidCents: 0,
      refundedCents: 0,
      balanceCents: 0,
      invoiceStatus: "none",
      paymentStatus: "unpaid",
    };
  }

  return runtime;
}
