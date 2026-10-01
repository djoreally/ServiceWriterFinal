import { apiClient } from "@/lib/api-client";
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

  const response = await apiClient.get<{ data: {
    appointment: any;
    items: any[];
    service: any | null;
    invoice: any | null;
    payments: any[];
    checklist: ChecklistRow[];
  } | null }>(`/v1/jobs/${encodeURIComponent(jobId)}/runtime`);
  const bundle = response.data;
  if (!bundle?.appointment) throw new Error("Job not found");
  const appointment = bundle.appointment;

  const itemsResult = { data: bundle.items, error: null };
  const serviceResult = { data: bundle.service, error: null };
  const invoiceResult = { data: bundle.invoice, error: null };
  const paymentsResult = { data: bundle.payments, error: null };
  const checklistResult = { data: bundle.checklist, error: null };

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
        amountCents: toCents(toCentsFromDollars(Number(p.amount || 0))),
        refundAmountCents: toCents(toCentsFromDollars(refundedDollars)),
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
