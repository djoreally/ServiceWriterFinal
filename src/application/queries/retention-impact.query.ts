/**
 * Retention Impact Queries — Derived metrics and grouped signals for the Command Center.
 *
 * Backed by existing tables: retention_signals, retention_vehicle_profiles, customers.
 * No schema changes required.
 */
import { supabase } from "@/integrations/supabase/client";

// ── Types ────────────────────────────────────────────────────
export type ImpactMetrics = {
  revenueAtRisk: number;
  winbackCustomers: number;
  overdueVehicles: number;
  loyaltyActive: number;
  trendDelta: number; // % change vs previous 30d (signal volume)
};

export type GroupedSignal = {
  signal_type: string;
  count: number;
  avg_score: number;
  max_score: number;
  estimated_impact: number; // $ derived from LTV when joinable
  signal_ids: string[];
  customer_ids: string[];
  vehicle_ids: string[];
  oldest_detected_at: string | null;
  newest_detected_at: string | null;
};

export type SignalRow = {
  id: string;
  signal_type: string;
  status: string;
  score: number | null;
  detected_at: string;
  customer_id: string | null;
  vehicle_id: string | null;
  payload_jsonb: Record<string, unknown> | null;
  customer?: { id: string; name: string | null; email: string | null; phone: string | null; lifetime_value: number | null } | null;
};

// Weighting per signal type — winback/overdue rank highest in the action queue.
const TYPE_WEIGHT: Record<string, number> = {
  winback_candidate: 1.0,
  customer_winback_candidate: 1.0,
  vehicle_overdue: 0.95,
  vehicle_at_risk: 0.9,
  at_risk: 0.85,
  cancelled_appointment: 0.7,
  customer_cancelled_appointment: 0.7,
  payment_received: 0.2,
  customer_payment_received: 0.2,
};

const ACTIVE_STATUSES: Array<"detected" | "active"> = ["detected", "active"];

// ── Hero Impact Metrics ──────────────────────────────────────
export async function fetchImpactMetrics(userId: string): Promise<ImpactMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [signalsRes, profilesRes, loyaltyRes, prevSignalsRes] = await Promise.all([
    supabase
      .from("retention_signals")
      .select("id, signal_type, customer_id, score, detected_at, status")
      .eq("user_id", userId)
      .in("status", ACTIVE_STATUSES)
      .gte("detected_at", thirtyDaysAgo),
    supabase
      .from("retention_vehicle_profiles")
      .select("vehicle_id, days_overdue")
      .eq("user_id", userId)
      .gt("days_overdue", 0),
    supabase
      .from("loyalty_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("retention_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("detected_at", sixtyDaysAgo)
      .lt("detected_at", thirtyDaysAgo),
  ]);

  if (signalsRes.error) throw signalsRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const signals = signalsRes.data || [];
  const winbackTypes = new Set(["winback_candidate", "customer_winback_candidate", "at_risk"]);
  const winbackCustomerIds = new Set<string>();
  signals.forEach((s) => {
    if (winbackTypes.has(s.signal_type) && s.customer_id) winbackCustomerIds.add(s.customer_id);
  });

  // Revenue at Risk = sum LTV of unique winback customers
  let revenueAtRisk = 0;
  if (winbackCustomerIds.size > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, lifetime_value")
      .in("id", Array.from(winbackCustomerIds));
    revenueAtRisk = (customers || []).reduce((sum, c) => sum + (Number(c.lifetime_value) || 0), 0);
  }

  const currentVolume = signals.length;
  const previousVolume = prevSignalsRes.count || 0;
  const trendDelta = previousVolume > 0
    ? ((currentVolume - previousVolume) / previousVolume) * 100
    : 0;

  return {
    revenueAtRisk,
    winbackCustomers: winbackCustomerIds.size,
    overdueVehicles: profilesRes.data?.length || 0,
    loyaltyActive: loyaltyRes.count || 0,
    trendDelta,
  };
}

// ── Grouped Signals (Action Queue) ───────────────────────────
export async function fetchGroupedActionableSignals(userId: string): Promise<GroupedSignal[]> {
  const { data: signals, error } = await supabase
    .from("retention_signals")
    .select("id, signal_type, status, score, detected_at, customer_id, vehicle_id")
    .eq("user_id", userId)
    .in("status", ACTIVE_STATUSES)
    .order("detected_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  if (!signals?.length) return [];

  // Collect unique customer ids for LTV lookup
  const customerIds = Array.from(new Set(signals.map((s) => s.customer_id).filter(Boolean) as string[]));
  const ltvMap = new Map<string, number>();
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, lifetime_value")
      .in("id", customerIds);
    (customers || []).forEach((c) => ltvMap.set(c.id, Number(c.lifetime_value) || 0));
  }

  // Group by signal_type
  const groups = new Map<string, GroupedSignal>();
  for (const s of signals) {
    const key = s.signal_type;
    if (!groups.has(key)) {
      groups.set(key, {
        signal_type: key,
        count: 0,
        avg_score: 0,
        max_score: 0,
        estimated_impact: 0,
        signal_ids: [],
        customer_ids: [],
        vehicle_ids: [],
        oldest_detected_at: null,
        newest_detected_at: null,
      });
    }
    const g = groups.get(key)!;
    g.count += 1;
    g.signal_ids.push(s.id);
    if (s.customer_id) g.customer_ids.push(s.customer_id);
    if (s.vehicle_id) g.vehicle_ids.push(s.vehicle_id);
    const score = Number(s.score) || 0;
    g.avg_score += score;
    g.max_score = Math.max(g.max_score, score);
    if (!g.oldest_detected_at || s.detected_at < g.oldest_detected_at) g.oldest_detected_at = s.detected_at;
    if (!g.newest_detected_at || s.detected_at > g.newest_detected_at) g.newest_detected_at = s.detected_at;
  }

  // Finalize avgs + estimated_impact (sum of unique customer LTVs in this group)
  const result: GroupedSignal[] = [];
  for (const g of groups.values()) {
    g.avg_score = g.count > 0 ? g.avg_score / g.count : 0;
    const uniqueCustomers = Array.from(new Set(g.customer_ids));
    g.estimated_impact = uniqueCustomers.reduce((sum, id) => sum + (ltvMap.get(id) || 0), 0);
    result.push(g);
  }

  // Sort by impact: weight × count × avg_score
  result.sort((a, b) => {
    const wa = (TYPE_WEIGHT[a.signal_type] ?? 0.5) * a.count * Math.max(a.avg_score, 0.1);
    const wb = (TYPE_WEIGHT[b.signal_type] ?? 0.5) * b.count * Math.max(b.avg_score, 0.1);
    return wb - wa;
  });

  return result.slice(0, 10);
}

// ── Group Drill-down (signals + customer info) ───────────────
export async function fetchSignalsByIds(signalIds: string[]): Promise<SignalRow[]> {
  if (!signalIds.length) return [];
  const { data, error } = await supabase
    .from("retention_signals")
    .select("id, signal_type, status, score, detected_at, customer_id, vehicle_id, payload_jsonb")
    .in("id", signalIds)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw error;

  const customerIds = Array.from(new Set((data || []).map((r) => r.customer_id).filter(Boolean) as string[]));
  const custMap = new Map<string, NonNullable<SignalRow["customer"]>>();
  if (customerIds.length) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, email, phone, lifetime_value")
      .in("id", customerIds);
    (customers || []).forEach((c) => custMap.set(c.id, c as NonNullable<SignalRow["customer"]>));
  }

  return (data || []).map((s) => ({
    ...s,
    payload_jsonb: s.payload_jsonb as Record<string, unknown> | null,
    customer: s.customer_id ? custMap.get(s.customer_id) ?? null : null,
  }));
}

// ── Signal Log (chronological, filterable) ───────────────────
export type SignalLogFilters = {
  type?: string;
  status?: string;
  scoreMin?: number;
  limit?: number;
};

export async function fetchSignalLog(userId: string, filters: SignalLogFilters = {}) {
  let q = supabase
    .from("retention_signals")
    .select("id, signal_type, status, score, detected_at, customer_id, vehicle_id, payload_jsonb")
    .eq("user_id", userId)
    .order("detected_at", { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.type) q = q.eq("signal_type", filters.type);
  if (filters.status) q = q.eq("status", filters.status as never);
  if (typeof filters.scoreMin === "number") q = q.gte("score", filters.scoreMin);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
