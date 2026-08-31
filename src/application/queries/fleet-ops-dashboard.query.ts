/**
 * Fleet OS Operations Center — dashboard aggregation query.
 *
 * Single Promise.all fan-out that returns everything the operations
 * center dashboard renders: KPIs, today's schedule, customer attention,
 * work order pipeline, technician status, revenue, PM forecast,
 * customer health, and inventory signals.
 *
 * No schema changes: uses fleet_clients, fleet_vehicles, fleet_work_orders,
 * fleet_service_schedules, technicians, time_clock_entries, inventory_items.
 */


import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FleetOpsKpis {
  todayJobs: number;
  todayRevenue: number;
  vehiclesScheduledToday: number;
  fleetCustomers: number;
  techniciansWorking: number;
  overduePms: number;
  outstandingInvoices: number;
  fleetHealth: number; // 0-100
}

export interface FleetOpsScheduleItem {
  id: string;
  time: string | null;
  clientName: string;
  vehicleCount: number;
  technicianName: string | null;
  status: string;
  total: number;
  locationName: string | null;
  eta: string | null;
}

export interface FleetOpsAttentionClient {
  fleetClientId: string;
  clientName: string;
  overdue: number;
  dueThisWeek: number;
  upcoming: number;
  awaitingApproval: number;
}

export interface FleetOpsPipeline {
  new: number;
  assigned: number;
  traveling: number;
  onSite: number;
  waitingApproval: number;
  completed: number;
  invoiced: number;
}

export interface FleetOpsTechnicianRow {
  id: string;
  name: string;
  status: string;
  currentLocation: { lat: number; lng: number } | null;
  currentJob: {
    id: string;
    clientName: string | null;
    scheduledTime: string | null;
  } | null;
  clockedIn: boolean;
}

export interface FleetOpsRevenue {
  scheduledToday: number;
  completedToday: number;
  pendingApproval: number;
  outstanding: number;
}

export interface FleetOpsForecast {
  today: number;
  thisWeek: number;
  nextWeek: number;
  thirtyDays: number;
}

export interface FleetOpsHealthCard {
  fleetClientId: string;
  clientName: string;
  vehicleCount: number;
  pmCompliance: number; // 0-100
  outstandingAr: number;
  lastVisit: string | null;
  lifetimeRevenue: number;
  monthlyAverage: number;
}

export interface FleetOpsInventoryRow {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  threshold: number;
  unit: string;
}

export interface FleetOpsInventory {
  oil: FleetOpsInventoryRow[];
  filters: FleetOpsInventoryRow[];
  drainPlugs: FleetOpsInventoryRow[];
  supplies: FleetOpsInventoryRow[];
  totalLow: number;
}

export interface FleetOpsDashboard {
  kpis: FleetOpsKpis;
  todaySchedule: FleetOpsScheduleItem[];
  attention: FleetOpsAttentionClient[];
  pipeline: FleetOpsPipeline;
  technicians: FleetOpsTechnicianRow[];
  revenue: FleetOpsRevenue;
  forecast: FleetOpsForecast;
  health: FleetOpsHealthCard[];
  inventory: FleetOpsInventory;
}

interface TodayWorkOrderRow {
  id: string;
  total?: number | null;
  status: string;
  assigned_technician_id?: string | null;
  scheduled_time?: string | null;
  fleet_client_id?: string | null;
  checkin_geo?: unknown;
  started_at?: string | null;
  technicians?: { name?: string | null; current_location?: unknown; status?: string | null } | null;
  fleet_clients?: { company_name?: string | null } | null;
  fleet_locations?: { name?: string | null } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function categorizeInventory(
  item: Pick<FleetOpsInventoryRow, "name" | "category">,
): keyof FleetOpsInventory | null {
  const name = String(item.name || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const haystack = `${name} ${category}`;

  if (/\b(oil|0w|5w|10w|15w|20w)\b/.test(haystack)) return "oil";
  if (haystack.includes("filter")) return "filters";
  if (haystack.includes("drain") || haystack.includes("plug") || haystack.includes("washer"))
    return "drainPlugs";
  if (
    haystack.includes("supply") ||
    haystack.includes("supplies") ||
    haystack.includes("rag") ||
    haystack.includes("glove") ||
    haystack.includes("shop")
  )
    return "supplies";
  return null;
}

// ─── Main fetcher ───────────────────────────────────────────────────────────

export async function fetchFleetOpsDashboard(userId: string): Promise<FleetOpsDashboard> {
  const now = new Date();
  const today = isoDate(now);
  const weekEnd = isoDate(addDays(now, 7));
  const nextWeekStart = isoDate(addDays(now, 8));
  const nextWeekEnd = isoDate(addDays(now, 14));
  const thirtyDayEnd = isoDate(addDays(now, 30));
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const startOfDayIso = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  const db = supabase;

  const [
    todayWosRes,
    scheduledTodayRes,
    clientsRes,
    activeTechsRes,
    clockedInRes,
    schedulesRes,
    outstandingWosRes,
    pipelineRes,
    revenueOutstandingRes,
    revenuePendingApprovalRes,
    inventoryRes,
    completedRes,
    paymentsRes,
  ] = await Promise.all([
    // Today's jobs + revenue (all statuses scheduled today)
    db
      .from("fleet_work_orders")
      .select(
        "id, scheduled_date, scheduled_time, status, total, assigned_technician_id, started_at, completed_at, fleet_client_id, fleet_vehicle_id, fleet_clients(company_name), fleet_locations(name), technicians:assigned_technician_id(name, current_location, status)"
      )
      .eq("user_id", userId)
      .eq("scheduled_date", today)
      .order("scheduled_time", { ascending: true, nullsFirst: false }),
    // Distinct vehicles scheduled today handled from todayWosRes below
    db
      .from("fleet_work_orders")
      .select("fleet_vehicle_id", { head: false })
      .eq("user_id", userId)
      .eq("scheduled_date", today),
    // Fleet customer count
    db
      .from("fleet_clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    // Active technicians for status panel
    db
      .from("technicians")
      .select("id, name, status, current_location")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name"),
    // Clocked-in technicians today
    db
      .from("time_clock_entries")
      .select("technician_id, status, clock_in, clock_out")
      .eq("user_id", userId)
      .is("clock_out", null)
      .gte("clock_in", startOfDayIso),
    // Service schedules — attention, health, forecast
    db
      .from("fleet_service_schedules")
      .select(
        "id, fleet_client_id, fleet_vehicle_id, due_date, status, queue_status, fleet_clients(company_name)"
      )
      .eq("user_id", userId),
    // Outstanding invoices total
    db
      .from("fleet_work_orders")
      .select("total, invoice_paid_amount, invoice_balance_due")
      .eq("user_id", userId)
      .in("invoice_status", ["sent", "partially_paid"]),
    // Pipeline: pull minimal fields for grouping
    db
      .from("fleet_work_orders")
      .select("id, status, assigned_technician_id, approval_required, submitted_at, accepted_at, started_at, completed_at, invoice_status, checkin_geo")
      .eq("user_id", userId)
      .in("status", [
        "draft",
        "pending_review",
        "scheduled",
        "assigned",
        "in_progress",
        "completed",
        "invoiced",
      ]),
    // Revenue: outstanding total
    db
      .from("fleet_work_orders")
      .select("invoice_balance_due")
      .eq("user_id", userId)
      .in("invoice_status", ["sent", "partially_paid"]),
    // Revenue: pending approval (approval required, not accepted)
    db
      .from("fleet_work_orders")
      .select("total")
      .eq("user_id", userId)
      .eq("approval_required", true)
      .is("accepted_at", null),
    // Inventory
    db
      .from("inventory_items")
      .select("id, name, category, quantity, low_stock_threshold, unit")
      .eq("user_id", userId),
    // Completed work orders (for health card LTV + monthly avg)
    db
      .from("fleet_work_orders")
      .select("fleet_client_id, total, completed_at")
      .eq("user_id", userId)
      .in("status", ["completed", "invoiced", "paid"])
      .order("completed_at", { ascending: false }),
    // Outstanding AR by client (from invoice balance)
    db
      .from("fleet_work_orders")
      .select("fleet_client_id, invoice_balance_due")
      .eq("user_id", userId)
      .in("invoice_status", ["sent", "partially_paid"]),
  ]);

  // ─── KPI: today's jobs / revenue / techs working ────────────────────────

  const todayWos = (todayWosRes.data ?? []) as TodayWorkOrderRow[];
  const todayJobs = todayWos.length;
  const todayRevenue = todayWos.reduce((s, w) => s + Number(w.total || 0), 0);
  const vehiclesScheduledToday = new Set(
    (scheduledTodayRes.data ?? []).map((r) => r.fleet_vehicle_id)
  ).size;
  const fleetCustomers = clientsRes.count ?? 0;

  const activeTechs = activeTechsRes.data ?? [];
  const clockedIn = new Set(
    (clockedInRes.data ?? []).map((r) => r.technician_id)
  );
  const techniciansWorking = clockedIn.size || activeTechs.length;

  // ─── KPI: fleet health + overdue PMs ────────────────────────────────────

  const schedules = schedulesRes.data ?? [];
  const uniqueVehicles = new Set(schedules.map((s) => s.fleet_vehicle_id));
  const overdueSet = new Set(
    schedules.filter((s) => s.status === "overdue").map((s) => s.fleet_vehicle_id)
  );
  const overduePms = overdueSet.size;
  const totalScheduledVehicles = uniqueVehicles.size;
  const fleetHealth =
    totalScheduledVehicles === 0
      ? 100
      : Math.round(((totalScheduledVehicles - overdueSet.size) / totalScheduledVehicles) * 100);

  // ─── KPI: outstanding invoices ──────────────────────────────────────────

  const outstandingInvoices = (outstandingWosRes.data ?? []).reduce(
    (s: number, r) =>
      s + Number(r.invoice_balance_due || Math.max(0, (r.total || 0) - (r.invoice_paid_amount || 0))),
    0
  );

  const kpis: FleetOpsKpis = {
    todayJobs,
    todayRevenue,
    vehiclesScheduledToday,
    fleetCustomers,
    techniciansWorking,
    overduePms,
    outstandingInvoices,
    fleetHealth,
  };

  // ─── Today's schedule ───────────────────────────────────────────────────

  // Group by client + time bucket so multiple vehicles collapse into one row.
  const scheduleByKey = new Map<string, FleetOpsScheduleItem>();
  todayWos.forEach((w) => {
    const time = w.scheduled_time ? String(w.scheduled_time).slice(0, 5) : null;
    const clientId = w.fleet_client_id || "unknown";
    const key = `${clientId}::${time || "unscheduled"}`;
    const existing = scheduleByKey.get(key);
    const tech = w.technicians ?? null;
    const clientName = w.fleet_clients?.company_name ?? "Unknown";
    const locationName = w.fleet_locations?.name ?? null;
    if (existing) {
      existing.vehicleCount += 1;
      existing.total += Number(w.total || 0);
    } else {
      scheduleByKey.set(key, {
        id: w.id,
        time,
        clientName,
        vehicleCount: 1,
        technicianName: tech?.name ?? null,
        status: w.status,
        total: Number(w.total || 0),
        locationName,
        eta: null,
      });
    }
  });
  const todaySchedule = Array.from(scheduleByKey.values()).sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  // ─── Customer attention (from schedules + WO waiting approval) ──────────

  const pipelineRows = pipelineRes.data ?? [];
  const awaitingByClient = new Map<string, number>();
  pipelineRows.forEach((w) => {
    const isWaiting =
      w.status === "pending_review" ||
      (w.approval_required === true && !w.accepted_at);
    if (isWaiting) {
      // We didn't select client id in pipelineRes to keep the payload lean;
      // instead we approximate via the total across all clients below.
    }
  });

  // For per-client attention counts, we need client id on both schedules and pipeline WOs.
  // Refetch waiting-approval WOs with client id (cheap).
  const { data: waitingRows } = await db
    .from("fleet_work_orders")
    .select("fleet_client_id, fleet_clients(company_name)")
    .eq("user_id", userId)
    .or("status.eq.pending_review,and(approval_required.eq.true,accepted_at.is.null)");

  (waitingRows ?? []).forEach((row) => {
    const key = row.fleet_client_id;
    if (!key) return;
    awaitingByClient.set(key, (awaitingByClient.get(key) || 0) + 1);
  });

  const clientAttention = new Map<string, FleetOpsAttentionClient>();
  const bumpAttention = (
    clientId: string,
    clientName: string,
    field: keyof Omit<FleetOpsAttentionClient, "fleetClientId" | "clientName">
  ) => {
    if (!clientId) return;
    const existing =
      clientAttention.get(clientId) ??
      ({
        fleetClientId: clientId,
        clientName,
        overdue: 0,
        dueThisWeek: 0,
        upcoming: 0,
        awaitingApproval: 0,
      } as FleetOpsAttentionClient);
    existing[field] = (existing[field] as number) + 1;
    clientAttention.set(clientId, existing);
  };

  schedules.forEach((s) => {
    const clientId = s.fleet_client_id;
    const clientName = s.fleet_clients?.company_name ?? "Unknown";
    if (!clientId) return;
    if (s.status === "overdue") {
      bumpAttention(clientId, clientName, "overdue");
    } else if (s.status === "due") {
      bumpAttention(clientId, clientName, "dueThisWeek");
    } else if (s.status === "upcoming") {
      bumpAttention(clientId, clientName, "upcoming");
    }
  });

  (waitingRows ?? []).forEach((row) => {
    if (!row.fleet_client_id) return;
    bumpAttention(
      row.fleet_client_id,
      row.fleet_clients?.company_name ?? "Unknown",
      "awaitingApproval"
    );
  });

  const attention = Array.from(clientAttention.values()).sort(
    (a, b) =>
      b.overdue * 3 +
      b.dueThisWeek * 2 +
      b.awaitingApproval * 2 +
      b.upcoming -
      (a.overdue * 3 + a.dueThisWeek * 2 + a.awaitingApproval * 2 + a.upcoming)
  );

  // ─── Pipeline funnel ────────────────────────────────────────────────────

  const pipeline: FleetOpsPipeline = {
    new: 0,
    assigned: 0,
    traveling: 0,
    onSite: 0,
    waitingApproval: 0,
    completed: 0,
    invoiced: 0,
  };
  pipelineRows.forEach((w) => {
    const waitingApproval =
      w.status === "pending_review" ||
      (w.approval_required === true && !w.accepted_at);
    if (waitingApproval) {
      pipeline.waitingApproval += 1;
      return;
    }
    switch (w.status) {
      case "draft":
        pipeline.new += 1;
        break;
      case "scheduled":
      case "assigned":
        if (w.assigned_technician_id) pipeline.assigned += 1;
        else pipeline.new += 1;
        break;
      case "in_progress":
        if (w.checkin_geo) pipeline.onSite += 1;
        else if (w.started_at) pipeline.traveling += 1;
        else pipeline.onSite += 1;
        break;
      case "completed":
        pipeline.completed += 1;
        break;
      case "invoiced":
        pipeline.invoiced += 1;
        break;
    }
  });

  // ─── Technician status panel ────────────────────────────────────────────

  // Map current WO per tech from today's WOs.
  const currentWoByTech = new Map<string, TodayWorkOrderRow>();
  todayWos.forEach((w) => {
    if (
      w.assigned_technician_id &&
      (w.status === "in_progress" || w.status === "assigned") &&
      !currentWoByTech.has(w.assigned_technician_id)
    ) {
      currentWoByTech.set(w.assigned_technician_id, w);
    }
  });

  const technicians: FleetOpsTechnicianRow[] = activeTechs.map((t) => {
    const wo = currentWoByTech.get(t.id);
    const loc = t.current_location as { lat?: number; lng?: number } | null;
    return {
      id: t.id,
      name: t.name,
      status: t.status || "available",
      currentLocation:
        loc && typeof loc.lat === "number" && typeof loc.lng === "number"
          ? { lat: loc.lat, lng: loc.lng }
          : null,
      currentJob: wo
        ? {
            id: wo.id,
            clientName: wo.fleet_clients?.company_name ?? null,
            scheduledTime: wo.scheduled_time ?? null,
          }
        : null,
      clockedIn: clockedIn.has(t.id),
    };
  });

  // ─── Revenue widget ─────────────────────────────────────────────────────

  // Completed revenue is derived from work orders completed today.
  const completedRows = completedRes.data ?? [];
  const completedTodayTotal = completedRows
    .filter((r) => r.completed_at && String(r.completed_at).slice(0, 10) === today)
    .reduce((s, r) => s + Number(r.total || 0), 0);

  const revenue: FleetOpsRevenue = {
    scheduledToday: todayRevenue,
    completedToday: completedTodayTotal,
    pendingApproval: (revenuePendingApprovalRes.data ?? []).reduce(
      (s: number, r) => s + Number(r.total || 0),
      0
    ),
    outstanding: (revenueOutstandingRes.data ?? []).reduce(
      (s: number, r) => s + Number(r.invoice_balance_due || 0),
      0
    ),
  };

  // ─── PM Forecast ────────────────────────────────────────────────────────

  const dueDates = schedules
    .filter((s) => ["due", "overdue", "upcoming"].includes(s.status))
    .map((s) => s.due_date)
    .filter(Boolean) as string[];

  const forecast: FleetOpsForecast = {
    today: dueDates.filter((d) => d <= today).length,
    thisWeek: dueDates.filter((d) => d > today && d <= weekEnd).length,
    nextWeek: dueDates.filter((d) => d >= nextWeekStart && d <= nextWeekEnd).length,
    thirtyDays: dueDates.filter((d) => d <= thirtyDayEnd).length,
  };

  // ─── Customer health cards ──────────────────────────────────────────────

  const vehicleCountByClient = new Map<string, number>();
  const overdueByClient = new Map<string, number>();
  const vehiclesByClient = new Map<string, Set<string>>();
  schedules.forEach((s) => {
    if (!s.fleet_client_id) return;
    const set =
      vehiclesByClient.get(s.fleet_client_id) ?? new Set<string>();
    set.add(s.fleet_vehicle_id);
    vehiclesByClient.set(s.fleet_client_id, set);
    if (s.status === "overdue") {
      overdueByClient.set(
        s.fleet_client_id,
        (overdueByClient.get(s.fleet_client_id) || 0) + 1
      );
    }
  });
  vehiclesByClient.forEach((v, k) => vehicleCountByClient.set(k, v.size));

  const revenueByClient = new Map<string, { total: number; last: string | null; monthly: number }>();
  const monthStartDate = new Date(monthStart);
  completedRows.forEach((r) => {
    if (!r.fleet_client_id) return;
    const existing = revenueByClient.get(r.fleet_client_id) ?? {
      total: 0,
      last: null as string | null,
      monthly: 0,
    };
    existing.total += Number(r.total || 0);
    if (r.completed_at && (!existing.last || r.completed_at > existing.last)) {
      existing.last = r.completed_at;
    }
    if (r.completed_at && new Date(r.completed_at) >= monthStartDate) {
      existing.monthly += Number(r.total || 0);
    }
    revenueByClient.set(r.fleet_client_id, existing);
  });

  const arByClient = new Map<string, number>();
  (paymentsRes.data ?? []).forEach((r) => {
    if (!r.fleet_client_id) return;
    arByClient.set(
      r.fleet_client_id,
      (arByClient.get(r.fleet_client_id) || 0) + Number(r.invoice_balance_due || 0)
    );
  });

  const clientNameLookup = new Map<string, string>();
  schedules.forEach((s) => {
    if (s.fleet_client_id && s.fleet_clients?.company_name) {
      clientNameLookup.set(s.fleet_client_id, s.fleet_clients.company_name);
    }
  });

  // Build health list ranked by lifetime revenue (top 5)
  const health: FleetOpsHealthCard[] = Array.from(revenueByClient.entries())
    .map(([clientId, rev]) => {
      const totalVehicles = vehicleCountByClient.get(clientId) || 0;
      const overdue = overdueByClient.get(clientId) || 0;
      const compliance =
        totalVehicles === 0 ? 100 : Math.round(((totalVehicles - overdue) / totalVehicles) * 100);
      return {
        fleetClientId: clientId,
        clientName: clientNameLookup.get(clientId) || "Unknown",
        vehicleCount: totalVehicles,
        pmCompliance: compliance,
        outstandingAr: arByClient.get(clientId) || 0,
        lastVisit: rev.last,
        lifetimeRevenue: rev.total,
        monthlyAverage: rev.monthly,
      };
    })
    .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
    .slice(0, 5);

  // ─── Inventory signals ──────────────────────────────────────────────────

  const inventoryRows = inventoryRes.data ?? [];
  const inventory: FleetOpsInventory = {
    oil: [],
    filters: [],
    drainPlugs: [],
    supplies: [],
    totalLow: 0,
  };
  inventoryRows.forEach((row) => {
    if (Number(row.quantity) > Number(row.low_stock_threshold)) return;
    const bucket = categorizeInventory(row);
    if (!bucket) return;
    const item: FleetOpsInventoryRow = {
      id: row.id,
      name: row.name,
      category: row.category ?? null,
      quantity: Number(row.quantity ?? 0),
      threshold: Number(row.low_stock_threshold ?? 0),
      unit: row.unit ?? "each",
    };
    (inventory[bucket] as FleetOpsInventoryRow[]).push(item);
    inventory.totalLow += 1;
  });

  return {
    kpis,
    todaySchedule,
    attention,
    pipeline,
    technicians,
    revenue,
    forecast,
    health,
    inventory,
  };
}
