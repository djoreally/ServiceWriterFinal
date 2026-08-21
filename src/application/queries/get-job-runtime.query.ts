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

function resolveLifecycleStatus(status: string | null | undefined, dispatchStatus: string | null | undefined): JobRuntime["lifecycle"]["status"] {
  const base = normalizeJobStatus(status);
  if (base === "completed" || base === "cancelled" || base === "no_show") return base;
  return normalizeJobStatus(dispatchStatus || status);
}

type ChecklistRow = { status: string | null; is_required: boolean | null; step_name: string | null };

/**
 * Checklist state is persisted separately from lifecycle state. Deriving it from
 * lifecycle previously made legitimate Retail completion impossible: an in_progress
 * job always reported an in_progress checklist, which canCompleteJob() rejects.
 */
function resolvePersistedChecklistStatus(rows: ChecklistRow[]): JobRuntime["execution"]["checklistStatus"] {
  if (!rows.length) return "complete"; // No steps defined -> nothing to enforce.
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

export async function getJobRuntime(
  jobId: string,
  trustContext?: TrustContext,
): Promise<JobRuntime> {
  const trust = trustContext ?? await buildTrustContext();
  const client = supabase as any;

  const { data: appointment, error } = await client
    .from("appointments")
    .select(`
      id, user_id, customer_id, vehicle_id, service_catalog_id, title, status, dispatch_status,
      assigned_technician_id, assigned_at, actual_start_time, actual_end_time,
      estimated_cost, tax_amount, created_at, updated_at,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, vin, year, make, model)
    `)
    .eq("id", jobId)
    .single();

  if (error || !appointment) {
    throw error || new Error("Job not found");
  }

  const [{ data: payments }, { data: checklistRows }] = await Promise.all([
    client
      .from("payments")
      .select("amount, refund_amount, status")
      .eq("appointment_id", jobId),
    client
      .from("job_execution_checklists")
      .select("status, is_required, step_name")
      .eq("job_id", jobId)
      .eq("job_source", "appointment"),
  ]);

  const checklist: ChecklistRow[] = (checklistRows ?? []) as ChecklistRow[];

  const lifecycleStatus = resolveLifecycleStatus(appointment.status, appointment.dispatch_status);
  const subtotalCents = toCentsFromDollars(Number(appointment.estimated_cost || 0));
  const taxCents = toCentsFromDollars(Number(appointment.tax_amount || 0));
  const totalCents = subtotalCents + taxCents;

  const summary = computeFinancialSummary({
    services: [{
      totalDueCents: toCents(totalCents),
      balanceDueCents: toCents(totalCents),
      jobStatus: lifecycleStatus === "completed" ? "completed" : "scheduled",
    }],
    payments: (payments || []).map((p: any) => ({
      amountCents: Number(p.amount || 0),
      refundAmountCents: Number(p.refund_amount || 0),
      status: p.status || "pending",
    })),
  });

  const visibleToUser = appointment.user_id === trust.orgId;
  const editableByUser = visibleToUser && trust.role !== "customer";
  const canView = canViewJob({
    id: appointment.id,
    orgId: appointment.user_id,
    customer: { id: "", name: "" },
    vehicle: { id: "" },
    service: {},
    lifecycle: { status: lifecycleStatus, updatedAt: appointment.updated_at || appointment.created_at || new Date().toISOString() },
    execution: { checklistStatus: "not_started" },
    dispatch: {},
    financials: {
      subtotalCents,
      taxCents,
      totalCents,
      paidCents: 0,
      refundedCents: 0,
      balanceCents: totalCents,
      invoiceStatus: "none",
      paymentStatus: "unpaid",
    },
    parts: { status: "not_required", required: [] },
    trust: { visibleToUser, editableByUser },
    timestamps: { createdAt: appointment.created_at || "", updatedAt: appointment.updated_at || appointment.created_at || "" },
  }, trust);
  if (!canView) {
    throw new Error("Not authorized to view this job.");
  }

  const runtime: JobRuntime = {
    id: appointment.id,
    orgId: appointment.user_id,
    customer: {
      id: appointment.customer?.id || appointment.customer_id || "",
      name: appointment.customer?.name || "Unknown Customer",
      phone: appointment.customer?.phone || undefined,
      email: appointment.customer?.email || undefined,
    },
    vehicle: {
      id: appointment.vehicle?.id || appointment.vehicle_id || "",
      vin: appointment.vehicle?.vin || undefined,
      year: appointment.vehicle?.year || undefined,
      make: appointment.vehicle?.make || undefined,
      model: appointment.vehicle?.model || undefined,
    },
    service: {
      appointmentId: appointment.id,
      serviceTypeId: appointment.service_catalog_id || undefined,
      serviceName: appointment.title || undefined,
    },
    lifecycle: {
      status: lifecycleStatus,
      updatedAt: appointment.updated_at || appointment.created_at || new Date().toISOString(),
    },
    execution: {
      checklistStatus: resolvePersistedChecklistStatus(checklist),
      startedAt: appointment.actual_start_time || undefined,
      completedAt: appointment.actual_end_time || undefined,
      blockingIssues: resolveBlockingIssues(checklist),
    },
    dispatch: {
      technicianId: appointment.assigned_technician_id || undefined,
      assignedAt: appointment.assigned_at || undefined,
      enRouteAt: appointment.actual_start_time || undefined,
      arrivedAt: appointment.actual_start_time || undefined,
    },
    financials: {
      subtotalCents,
      taxCents,
      totalCents,
      paidCents: summary.collectedCents,
      refundedCents: summary.refundedCents,
      balanceCents: Math.max(totalCents - summary.collectedCents, 0),
      invoiceStatus: deriveInvoiceStatus(summary),
      paymentStatus: deriveSettlementStatus(summary),
    },
    parts: {
      status: "not_required",
      required: [],
    },
    trust: {
      visibleToUser,
      editableByUser,
      organizationRole: trust.role,
      subscriptionTier: trust.subscriptionTier,
    },
    timestamps: {
      createdAt: appointment.created_at || new Date().toISOString(),
      updatedAt: appointment.updated_at || appointment.created_at || new Date().toISOString(),
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
