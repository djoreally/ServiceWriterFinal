import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticatedResult } from "../supabase";
import { checkRange, errorResult, isoDate, jsonResult, round2 } from "../shared/schema";

type Bucket = { key: string; service_count: number; billed_total: number; collected_total: number };

function bucketFor(map: Map<string, Bucket>, key: string): Bucket {
  const existing = map.get(key);
  if (existing) return existing;
  const created = { key, service_count: 0, billed_total: 0, collected_total: 0 };
  map.set(key, created);
  return created;
}

export default defineTool({
  name: "get_revenue_summary",
  title: "Get revenue summary",
  description:
    "Summarise real service revenue over a date range (max 400 days) from completed ServiceWriter service records. Returns billed totals (services.total_cost), amounts collected on those records (paid_amount), service counts, average ticket, and a breakdown grouped by `service_type`, `month`, `day`, `technician`, `city` or `postal_code`. Also returns separately reconciled card/online payments captured in the payment records ledger for the same window. Location breakdowns come from the appointment linked to each service record; service records with no linked appointment are grouped under `unknown`. Access follows the caller's financial permissions and RLS.",
  inputSchema: {
    from_date: isoDate.describe("First service date to include (YYYY-MM-DD)."),
    to_date: isoDate.describe("Last service date to include, inclusive (YYYY-MM-DD). Max 400 days."),
    group_by: z
      .enum(["service_type", "month", "day", "technician", "city", "postal_code", "none"])
      .optional()
      .describe("Breakdown dimension (default `service_type`)."),
    city: z.string().min(1).max(80).optional().describe("Restrict to service records whose linked appointment is in this customer city."),
    postal_code: z.string().min(3).max(12).optional().describe("Restrict to service records whose linked appointment is in this postal code."),
    status: z
      .enum(["completed", "pending", "in_progress", "scheduled", "cancelled", "any"])
      .optional()
      .describe("Service record status filter (default `completed`)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, group_by, city, postal_code, status }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    const range = checkRange(from_date, to_date, 400);
    if (!range.ok) return errorResult(range.message!);
    const supabase = supabaseForUser(ctx);

    const dimension = group_by ?? "service_type";
    const statusFilter = status ?? "completed";

    let servicesQuery = supabase
      .from("services")
      .select(
        "id, service_date, service_type, status, total_cost, paid_amount, payment_status, technician, appointment_id, appointment:appointment_id (customer_city, customer_state, customer_postal_code)",
      )
      .is("deleted_at", null)
      .gte("service_date", from_date)
      .lte("service_date", to_date)
      .limit(5000);
    if (statusFilter !== "any") servicesQuery = servicesQuery.eq("status", statusFilter);

    const [servicesRes, paymentsRes] = await Promise.all([
      servicesQuery,
      supabase
        .from("payment_records")
        .select("id, amount, refund_amount, status, payment_type, created_at")
        .is("deleted_at", null)
        .gte("created_at", `${from_date}T00:00:00Z`)
        .lte("created_at", `${to_date}T23:59:59Z`)
        .limit(5000),
    ]);

    if (servicesRes.error) {
      return errorResult(
        `Service revenue is not readable for this account (${servicesRes.error.message}). This is enforced by row-level security / financial permissions.`,
      );
    }

    const rows = (servicesRes.data ?? []) as Array<Record<string, any>>;
    const cityKey = city?.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const appt = row.appointment as Record<string, unknown> | null;
      if (cityKey && String(appt?.customer_city ?? "").toLowerCase() !== cityKey) return false;
      if (postal_code && String(appt?.customer_postal_code ?? "") !== postal_code) return false;
      return true;
    });

    const buckets = new Map<string, Bucket>();
    let billed = 0;
    let collected = 0;
    for (const row of filtered) {
      const total = Number(row.total_cost ?? 0) || 0;
      const paid = Number(row.paid_amount ?? 0) || 0;
      billed += total;
      collected += paid;

      if (dimension !== "none") {
        const appt = row.appointment as Record<string, unknown> | null;
        const key =
          dimension === "service_type"
            ? String(row.service_type ?? "unknown")
            : dimension === "month"
              ? String(row.service_date ?? "").slice(0, 7) || "unknown"
              : dimension === "day"
                ? String(row.service_date ?? "unknown")
                : dimension === "technician"
                  ? String(row.technician ?? "unassigned")
                  : dimension === "city"
                    ? String(appt?.customer_city ?? "unknown")
                    : String(appt?.customer_postal_code ?? "unknown");
        const bucket = bucketFor(buckets, key);
        bucket.service_count += 1;
        bucket.billed_total = round2(bucket.billed_total + total);
        bucket.collected_total = round2(bucket.collected_total + paid);
      }
    }

    const payments = (paymentsRes.data ?? []) as Array<Record<string, any>>;
    const settledCents = payments
      .filter((p) => ["succeeded", "paid", "completed", "captured"].includes(String(p.status ?? "").toLowerCase()))
      .reduce((sum, p) => sum + (Number(p.amount ?? 0) || 0) - (Number(p.refund_amount ?? 0) || 0), 0);

    return jsonResult({
      from_date,
      to_date,
      status_filter: statusFilter,
      filters: { city: city ?? null, postal_code: postal_code ?? null },
      totals: {
        service_count: filtered.length,
        billed_total: round2(billed),
        collected_on_service_records: round2(collected),
        average_ticket: filtered.length ? round2(billed / filtered.length) : null,
      },
      payments_ledger: paymentsRes.error
        ? { available: false, reason: "Payment records are not readable for this account (financial permissions / RLS)." }
        : {
            available: true,
            record_count: payments.length,
            net_settled_amount: round2(settledCents / 100),
            currency: "USD",
            note: "Card/online payments captured in the payment ledger by created_at. Not directly comparable to billed_total, which includes cash and unpaid work.",
          },
      group_by: dimension,
      breakdown:
        dimension === "none"
          ? null
          : [...buckets.values()].sort((a, b) => b.billed_total - a.billed_total),
      limitations: [
        "`billed_total` is the sum of services.total_cost, the canonical billed amount. Collected cash is tracked per service record and in the payment ledger.",
        dimension === "city" || dimension === "postal_code" || cityKey || postal_code
          ? "Location comes from the appointment linked to each service record; walk-in/manual service records without an appointment fall into `unknown` and are excluded by city/postal filters."
          : null,
        filtered.length >= 5000 ? "Service scan hit the 5000-row cap; narrow the date range for exact totals." : null,
      ].filter(Boolean),
    });
  },
});
