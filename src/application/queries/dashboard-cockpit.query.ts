/**
 * Dashboard Cockpit Query
 *
 * Single source of truth for the main owner dashboard. Returns canonical
 * financial + operational metrics for today / this week / this month / YTD,
 * plus the live operations queue (today's appointments, jobs in progress,
 * outstanding A/R).
 *
 * All money is stored in `payment_records.amount` as INTEGER CENTS and is
 * converted to dollars here so the UI can format with the currency helper.
 */
import type { Dollars } from '@/lib/money';
import { errorMessage } from "@/lib/error-message";
import { supabase } from '@/integrations/supabase/client';
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfYear,
  startOfDay,
  endOfDay,
  addDays,
  parseISO,
} from 'date-fns';

export interface CockpitAppointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  guest_name: string | null;
  estimated_cost: number | null;
}

export interface CockpitJobInProgress {
  id: string;
  service_type: string;
  customer_name: string;
  vehicle: string | null;
  started_at: string | null;
}

export interface CockpitServiceTypeRev {
  type: string;
  revenue: number;
  count: number;
}

export type FleetPanelStatus = 'ready' | 'empty' | 'error';

export interface FleetPanelState {
  status: FleetPanelStatus;
  message?: string;
}

export interface FleetOperationsKpis {
  fleetCustomers: number;
  techniciansWorking: number;
  vehiclesScheduledToday: number;
  overduePms: number;
  fleetHealthScore: number;
  scheduledRevenueToday: number;
  completedRevenueToday: number;
  pendingApprovalRevenue: number;
}

export interface FleetScheduleItem {
  id: string;
  time: string | null;
  customerName: string;
  vehicleCount: number;
  assignedTechnician: string | null;
  route: string | null;
  etaMinutes: number | null;
  status: string;
}

export interface FleetAttentionGroup {
  customerId: string;
  customerName: string;
  overduePm: number;
  dueThisWeek: number;
  upcomingPm: number;
  waitingApproval: number;
}

export interface FleetPipelineStage {
  stage:
    | 'New'
    | 'Assigned'
    | 'Traveling'
    | 'On Site'
    | 'Waiting Approval'
    | 'Completed'
    | 'Invoiced';
  count: number;
}

export interface FleetTechnicianStatus {
  id: string;
  name: string;
  status: 'Driving' | 'On Site' | 'Lunch' | 'Available' | 'Offline';
  currentWorkOrder: string | null;
  etaMinutes: number | null;
  currentLocation: { lat: number; lng: number } | null;
}

export interface FleetCustomerHealth {
  customerId: string;
  customerName: string;
  pmCompliance: number;
  outstandingAr: number;
  lastVisit: string | null;
  lifetimeRevenue: number;
  monthlyAverageRevenue: number;
}

export interface FleetVehiclePmCompliance {
  vehicleId: string;
  customerId: string;
  customerName: string;
  vehicleLabel: string;
  pmCompliance: number;
  dueStatus: 'overdue' | 'due_this_week' | 'upcoming' | 'current' | 'unknown';
  lastServiceDate: string | null;
  nextServiceDate: string | null;
  mileage: number | null;
}

export interface FleetPmQueueItem {
  vehicleId: string;
  customerId: string;
  customerName: string;
  vehicleLabel: string;
  nextServiceDate: string | null;
  daysUntilDue: number | null;
  complianceScore: number;
  recommendation: string;
  approvalUrl: string;
  estimateUrl: string;
}

export interface FleetPmQueues {
  overdue: FleetPmQueueItem[];
  dueThisWeek: FleetPmQueueItem[];
  upcoming: FleetPmQueueItem[];
  thirtyDays: FleetPmQueueItem[];
}

export interface FleetArAgingBucket {
  label: 'Current' | '1-30' | '31-60' | '61-90' | '90+';
  amount: Dollars;
  count: number;
}

export interface FleetInvoiceQueueItem {
  workOrderId: string;
  customerId: string;
  customerName: string;
  invoiceStatus: string;
  amount: Dollars;
  daysOutstanding: number;
  invoiceUrl: string;
  workOrderUrl: string;
}

export interface FleetRevenueCommand {
  forecast30Days: Dollars;
  approvalDollars: Dollars;
  outstandingAr: Dollars;
  arAging: FleetArAgingBucket[];
  invoiceQueue: FleetInvoiceQueueItem[];
}

export interface FleetInventorySummary {
  lowInventory: number;
  oilGrades: number;
  filters: number;
  drainPlugs: number;
  shopSupplies: number;
}

export interface FleetInventoryRequirement {
  category: 'Oil Grades' | 'Filters' | 'Drain Plugs' | 'Shop Supplies';
  required: number;
  available: number;
  shortage: number;
}

export interface FleetRouteReadiness {
  route: string;
  workOrderId: string;
  customerName: string;
  vehicleCount: number;
  ready: boolean;
  requirements: FleetInventoryRequirement[];
  receiveInventoryUrl: string;
  replenishUrl: string;
}

export interface FleetLowStockReplenishment {
  category: string;
  shortage: number;
  receiveInventoryUrl: string;
  replenishUrl: string;
}

export interface FleetInventoryReadiness {
  routes: FleetRouteReadiness[];
  lowStockReplenishment: FleetLowStockReplenishment[];
}

export interface FleetMapPoint {
  id: string;
  label: string;
  type: 'technician' | 'customer' | 'stop';
  status: string | null;
  route: string | null;
  etaMinutes: number | null;
  location: { lat: number; lng: number } | null;
}

export interface FleetLiveRouteAction {
  workOrderId: string;
  route: string;
  customerName: string;
  assignedTechnician: string | null;
  etaMinutes: number | null;
  reassignUrl: string;
  availabilityUrl: string;
}

export interface FleetOperationsDashboard {
  kpis: FleetOperationsKpis;
  schedule: FleetScheduleItem[];
  attention: FleetAttentionGroup[];
  pipeline: FleetPipelineStage[];
  technicians: FleetTechnicianStatus[];
  pmForecast: { today: number; thisWeek: number; nextWeek: number; thirtyDays: number };
  pmQueues: FleetPmQueues;
  vehicleCompliance: FleetVehiclePmCompliance[];
  revenueCommand: FleetRevenueCommand;
  customerHealth: FleetCustomerHealth[];
  inventory: FleetInventorySummary;
  inventoryReadiness: FleetInventoryReadiness;
  mapPoints: FleetMapPoint[];
  liveRouteActions: FleetLiveRouteAction[];
  panels: Record<
    | 'schedule'
    | 'attention'
    | 'pipeline'
    | 'technicians'
    | 'revenue'
    | 'pmForecast'
    | 'customerHealth'
    | 'inventory'
    | 'map',
    FleetPanelState
  >;
}

export interface CockpitData {
  // Money (dollars)
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  revenueYTD: number;
  revenueTodayPrev: number; // yesterday, for trend
  revenueMonthPrev: number; // last month MTD-equivalent, for trend
  outstandingAR: number; // dollars

  // Operations counters
  jobsInProgress: number;
  jobsCompletedToday: number;
  appointmentsToday: number;
  unpaidInvoices: number;

  // Live lists
  todaysAppointments: CockpitAppointment[];
  upcomingNext7: CockpitAppointment[];
  jobsInProgressList: CockpitJobInProgress[];

  // Breakdown
  serviceTypeRevenueMTD: CockpitServiceTypeRev[];

  // Fleet OS operations contracts
  fleetOperations: FleetOperationsDashboard;
}

function sumNetCollectedDollars(
  rows: Array<{ net_collected_cents: number | null }> | null
): number {
  return (rows || []).reduce((sum, row) => sum + (Number(row.net_collected_cents) || 0), 0) / 100;
}

const emptyPanel = (message: string): FleetPanelState => ({ status: 'empty', message });
const readyPanel = (): FleetPanelState => ({ status: 'ready' });
const errorPanel = (message: string): FleetPanelState => ({ status: 'error', message });

function panelState<T>(rows: T[], emptyMessage: string, error?: unknown): FleetPanelState {
  if (error) return errorPanel(errorMessage(error, "The backend did not return fleet data."));
  return rows.length > 0 ? readyPanel() : emptyPanel(emptyMessage);
}

const PIPELINE_STATUS_MAP: Record<string, FleetPipelineStage['stage']> = {
  draft: 'New',
  new: 'New',
  submitted: 'New',
  assigned: 'Assigned',
  accepted: 'Assigned',
  traveling: 'Traveling',
  en_route: 'Traveling',
  in_progress: 'On Site',
  on_site: 'On Site',
  waiting_approval: 'Waiting Approval',
  approval_required: 'Waiting Approval',
  completed: 'Completed',
  invoiced: 'Invoiced',
  paid: 'Invoiced',
};

const TECH_STATUS_MAP: Record<string, FleetTechnicianStatus['status']> = {
  driving: 'Driving',
  traveling: 'Driving',
  en_route: 'Driving',
  on_site: 'On Site',
  on_job: 'On Site',
  busy: 'On Site',
  lunch: 'Lunch',
  on_break: 'Lunch',
  available: 'Available',
  offline: 'Offline',
};

export async function fetchDashboardCockpit(): Promise<CockpitData | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) return null;

  const now = new Date();
  const todayStart = format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss");
  const todayEnd = format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss");
  const today = format(now, 'yyyy-MM-dd');
  const yesterday = format(addDays(startOfDay(now), -1), "yyyy-MM-dd'T'HH:mm:ss");
  const yesterdayEnd = format(addDays(endOfDay(now), -1), "yyyy-MM-dd'T'HH:mm:ss");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ss");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd'T'HH:mm:ss");
  const yearStart = format(startOfYear(now), "yyyy-MM-dd'T'HH:mm:ss");
  const next7 = format(addDays(now, 7), 'yyyy-MM-dd');

  // Previous month, same number of days into the month (MTD-comparable)
  const dayOfMonth = now.getDate();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStart = format(startOfMonth(prevMonth), "yyyy-MM-dd'T'HH:mm:ss");
  const prevMonthMtdEnd = format(
    endOfDay(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), dayOfMonth)),
    "yyyy-MM-dd'T'HH:mm:ss"
  );

  const [
    payToday,
    payYesterday,
    payWeek,
    payMonth,
    payYTD,
    payPrevMonth,
    todayAppts,
    upcoming7,
    inProgress,
    completedToday,
    completedMonth,
    outstandingServices,
    apptServices,
    fleetClientsRes,
    fleetVehiclesRes,
    fleetWorkOrdersRes,
    fleetTechsRes,
    fleetInventoryRes,
    fleetApprovalsRes,
  ] = await Promise.all([
    supabase
      .from('cash_collection_receipts_v1')
      .select('net_collected_cents')
      .gte('collected_at', todayStart)
      .lte('collected_at', todayEnd),
    supabase
      .from('cash_collection_receipts_v1')
      .select('net_collected_cents')
      .gte('collected_at', yesterday)
      .lte('collected_at', yesterdayEnd),
    supabase
      .from('cash_collection_receipts_v1')
      .select('net_collected_cents')
      .gte('collected_at', weekStart),
    supabase
      .from('cash_collection_receipts_v1')
      .select('net_collected_cents')
      .gte('collected_at', monthStart),
    supabase
      .from('cash_collection_receipts_v1')
      .select('net_collected_cents')
      .gte('collected_at', yearStart),
    supabase
      .from('cash_collection_receipts_v1')
      .select('net_collected_cents')
      .gte('collected_at', prevMonthStart)
      .lte('collected_at', prevMonthMtdEnd),
    supabase
      .from('appointments')
      .select('id, title, starts_at, status, guest_name, estimated_cost, metadata')
      .gte('starts_at', `${today}T00:00:00`)
      .lte('starts_at', `${today}T23:59:59`)
      .in('status', ['confirmed', 'pending', 'in_progress', 'requested'])
      .order('starts_at', { ascending: true }),
    supabase
      .from('appointments')
      .select('id, title, starts_at, status, guest_name, estimated_cost, metadata')
      .gt('starts_at', `${today}T23:59:59`)
      .lte('starts_at', `${next7}T23:59:59`)
      .in('status', ['confirmed', 'pending', 'requested'])
      .order('starts_at', { ascending: true })
      .limit(10),
    supabase
      .from('services')
      .select(
        `id, service_type, service_date, customer:customers!fk_services_customer(name), vehicle:vehicles(make,model,year)`
      )
      .eq('status', 'in_progress')
      .order('service_date', { ascending: false })
      .limit(20),
    supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .eq('service_date', today),
    supabase
      .from('services')
      .select('service_type, total_cost, paid_amount, service_date, appointment_id, status')
      .gte('service_date', format(startOfMonth(now), 'yyyy-MM-dd'))
      .eq('status', 'completed'),
    // Outstanding A/R: only fetch services that are NOT marked paid. payment_status is the source of truth.
    supabase
      .from('services')
      .select('total_cost, paid_amount, status, payment_status')
      .eq('status', 'completed')
      .or('payment_status.eq.unpaid,payment_status.eq.partial'),
    supabase.from('appointment_services').select('appointment_id, name, price, quantity'),
    supabase
      .from('fleet_clients')
      .select('id, company_name, status')
      .eq('user_id', userId)
      .is('deleted_at', null),
    supabase
      .from('fleet_vehicles')
      .select(
        'id, fleet_client_id, next_service_date, last_service_date, mileage, year, make, model, unit_number, due_status, status'
      )
      .eq('user_id', userId)
      .is('deleted_at', null),
    supabase
      .from('fleet_work_orders')
      .select(
        'id, fleet_client_id, fleet_vehicle_id, status, scheduled_date, scheduled_time, assigned_technician_id, total, invoice_status, invoiced_at, completed_at, approval_required, fleet_clients(company_name), fleet_locations(name, latitude, longitude), technicians(name, status, current_location)'
      )
      .eq('user_id', userId)
      .gte('scheduled_date', today)
      .lte('scheduled_date', format(addDays(now, 30), 'yyyy-MM-dd'))
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .limit(200),
    supabase
      .from('technicians')
      .select('id, name, status, current_location')
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase
      .from('van_inventory')
      .select('id, quantity, min_quantity, inventory_items(name, category)'),
    supabase
      .from('fleet_approvals')
      .select('id, fleet_work_order_id, status, estimated_cost')
      .eq('user_id', userId)
      .eq('status', 'pending'),
  ]);

  // Outstanding A/R = sum of (total_cost - paid_amount) for completed services
  // whose payment_status is explicitly 'unpaid' or 'partial'. We trust payment_status
  // as the source of truth — services flagged 'paid' (including imported historical
  // records) are excluded even if paid_amount is missing.
  const outstandingRows = (
    (outstandingServices.data || []) as Array<{
      total_cost: Dollars | null;
      paid_amount: Dollars | null;
      status: string | null;
      payment_status: string | null;
    }>
  ).filter((s) => {
    if (s.status !== 'completed') return false;
    const ps = s.payment_status;
    if (ps !== 'unpaid' && ps !== 'partial') return false;
    const remaining = Math.max((Number(s.total_cost) || 0) - (Number(s.paid_amount) || 0), 0);
    return remaining > 0.01;
  });

  const outstandingAR = outstandingRows.reduce(
    (sum, s) => sum + Math.max((Number(s.total_cost) || 0) - (Number(s.paid_amount) || 0), 0),
    0
  );

  const unpaidInvoices = outstandingRows.length;

  // Service type revenue MTD — prefer services.total_cost; fallback to appointment_services line items.
  const lineItems = (apptServices.data || []) as Array<{
    appointment_id: string;
    name: string;
    price: Dollars;
    quantity: number;
  }>;
  const apptRevMap = new Map<string, number>();
  for (const li of lineItems) {
    const cur = apptRevMap.get(li.appointment_id) || 0;
    apptRevMap.set(li.appointment_id, cur + (Number(li.price) || 0) * (li.quantity || 1));
  }
  const typeMap: Record<string, { revenue: number; count: number }> = {};
  for (const s of (completedMonth.data || []) as unknown as Array<{
    service_type: string;
    total_cost: Dollars;
    appointment_id: string | null;
  }>) {
    const t = s.service_type || 'Other';
    if (!typeMap[t]) typeMap[t] = { revenue: 0, count: 0 };
    let rev = Number(s.total_cost) || 0;
    if (rev === 0 && s.appointment_id) rev = apptRevMap.get(s.appointment_id) || 0;
    typeMap[t].revenue += rev;
    typeMap[t].count += 1;
  }
  const serviceTypeRevenueMTD = Object.entries(typeMap)
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // Build job-in-progress display rows
  type InProgressRow = {
    id: string;
    service_type: string | null;
    service_date: string | null;
    customer?: { name: string | null } | null;
    vehicle?: { year: number | null; make: string | null; model: string | null } | null;
  };
  const jobsInProgressList: CockpitJobInProgress[] = (
    (inProgress.data || []) as unknown as InProgressRow[]
  ).map((s) => ({
    id: s.id,
    service_type: s.service_type || 'Service',
    customer_name: s.customer?.name || 'Customer',
    vehicle: s.vehicle ? `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model}` : null,
    started_at: s.service_date || null,
  }));

  type ApptRawRow = {
    id: string;
    title?: string | null;
    starts_at?: string | null;
    scheduled_date?: string | null;
    scheduled_time?: string | null;
    status: string;
    guest_name?: string | null;
    estimated_cost?: number | null;
    metadata?: unknown;
  };

  function mapApptRow(row: ApptRawRow): CockpitAppointment {
    const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
    let schedDate = row.scheduled_date ?? '';
    let schedTime = row.scheduled_time ?? null;
    if (row.starts_at) {
      const dt = new Date(row.starts_at);
      if (!Number.isNaN(dt.getTime())) {
        schedDate = format(dt, 'yyyy-MM-dd');
        schedTime = format(dt, 'HH:mm');
      }
    }
    const apptTitle = row.title || String(meta.title ?? meta.service_name ?? 'Appointment');
    return {
      id: row.id,
      title: apptTitle,
      scheduled_date: schedDate,
      scheduled_time: schedTime,
      status: row.status,
      guest_name: row.guest_name ?? (typeof meta.guest_name === 'string' ? meta.guest_name : null),
      estimated_cost: row.estimated_cost ?? (meta.estimated_cost != null ? Number(meta.estimated_cost) : null),
    };
  }

  const todaysAppointments = ((todayAppts.data || []) as unknown as ApptRawRow[]).map(mapApptRow);
  const upcomingNext7 = ((upcoming7.data || []) as unknown as ApptRawRow[])
    .map(mapApptRow)
    .map((a) => ({
      a,
      ts: parseISO(`${a.scheduled_date}T${a.scheduled_time || '00:00'}`),
    }))
    .filter(({ ts }) => !Number.isNaN(ts.getTime()))
    .sort((x, y) => x.ts.getTime() - y.ts.getTime())
    .slice(0, 8)
    .map(({ a }) => a);

  type FleetWorkOrderRow = {
    id: string;
    fleet_client_id: string | null;
    fleet_vehicle_id: string | null;
    status: string | null;
    scheduled_date: string | null;
    scheduled_time: string | null;
    assigned_technician_id: string | null;
    total: Dollars | null;
    invoice_status: string | null;
    invoiced_at: string | null;
    completed_at: string | null;
    approval_required: boolean | null;
    fleet_clients?: { company_name: string | null } | null;
    fleet_locations?: {
      name: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
    technicians?: {
      name: string | null;
      status: string | null;
      current_location: { lat: number; lng: number } | null;
    } | null;
  };
  type FleetClientRow = { id: string; company_name: string | null; status: string | null };
  type FleetVehicleRow = {
    id: string;
    fleet_client_id: string | null;
    next_service_date: string | null;
    last_service_date: string | null;
    mileage: number | null;
    year: number | null;
    make: string | null;
    model: string | null;
    unit_number: string | null;
    due_status: string | null;
    status: string | null;
  };
  type FleetTechRow = {
    id: string;
    name: string | null;
    status: string | null;
    current_location: { lat: number; lng: number } | null;
  };
  type FleetInventoryRow = {
    id: string;
    quantity: number | null;
    min_quantity: number | null;
    inventory_items?: { name: string | null; category: string | null } | null;
  };
  type FleetApprovalRow = {
    id: string;
    fleet_work_order_id: string;
    status: string;
    estimated_cost: Dollars | null;
  };

  const fleetClients = ((fleetClientsRes.data || []) as FleetClientRow[]).filter(
    (c) => c.status !== 'inactive'
  );
  const fleetVehicles = (fleetVehiclesRes.data || []) as FleetVehicleRow[];
  const fleetWorkOrders = (fleetWorkOrdersRes.data || []) as unknown as FleetWorkOrderRow[];
  const fleetTechnicians = (fleetTechsRes.data || []) as FleetTechRow[];
  const fleetInventory = (fleetInventoryRes.data || []) as unknown as FleetInventoryRow[];
  const fleetApprovals = (fleetApprovalsRes.data || []) as unknown as FleetApprovalRow[];

  const todayFleetOrders = fleetWorkOrders.filter((wo) => wo.scheduled_date === today);
  const waitingApprovalOrders = fleetWorkOrders.filter(
    (wo) => wo.approval_required || wo.status === 'waiting_approval'
  );
  const invoicedOrders = fleetWorkOrders.filter(
    (wo) => wo.invoice_status && wo.invoice_status !== 'paid'
  );
  const completedFleetRevenue = todayFleetOrders
    .filter((wo) => wo.status === 'completed' || wo.status === 'invoiced' || wo.status === 'paid')
    .reduce((sum, wo) => sum + (Number(wo.total) || 0), 0) as Dollars;
  const scheduledFleetRevenue = todayFleetOrders.reduce(
    (sum, wo) => sum + (Number(wo.total) || 0),
    0
  ) as Dollars;
  const pendingApprovalRevenue = (waitingApprovalOrders.reduce(
    (sum, wo) => sum + (Number(wo.total) || 0),
    0
  ) +
    fleetApprovals.reduce(
      (sum, approval) => sum + (Number(approval.estimated_cost) || 0),
      0
    )) as Dollars;

  const invoiceableOrders = fleetWorkOrders.filter((wo) =>
    ['pending', 'sent', 'partially_paid', 'void'].includes(wo.invoice_status || '')
  );
  const forecast30Days = fleetWorkOrders.reduce(
    (sum, wo) => sum + (Number(wo.total) || 0),
    0
  ) as Dollars;
  const fleetOutstandingAr = invoiceableOrders
    .filter((wo) => wo.invoice_status !== 'void')
    .reduce((sum, wo) => sum + (Number(wo.total) || 0), 0) as Dollars;
  const invoiceQueue: FleetInvoiceQueueItem[] = invoiceableOrders
    .filter((wo) => wo.invoice_status !== 'void')
    .map((wo) => {
      const invoiceDate = wo.invoiced_at || wo.completed_at || wo.scheduled_date || today;
      const daysOutstanding = Math.max(
        0,
        Math.floor((now.getTime() - new Date(invoiceDate).getTime()) / (24 * 60 * 60 * 1000))
      );
      return {
        workOrderId: wo.id,
        customerId: wo.fleet_client_id || 'unassigned',
        customerName: wo.fleet_clients?.company_name || 'Fleet customer',
        invoiceStatus: wo.invoice_status || 'pending',
        amount: (Number(wo.total) || 0) as Dollars,
        daysOutstanding,
        invoiceUrl: `/invoices?fleetWorkOrderId=${wo.id}&fleetClientId=${wo.fleet_client_id || ''}`,
        workOrderUrl: `/fleet-os/work-orders/${wo.id}`,
      };
    })
    .sort((a, b) => b.daysOutstanding - a.daysOutstanding)
    .slice(0, 10);
  const arAging: FleetArAgingBucket[] = [
    { label: 'Current', amount: 0 as Dollars, count: 0 },
    { label: '1-30', amount: 0 as Dollars, count: 0 },
    { label: '31-60', amount: 0 as Dollars, count: 0 },
    { label: '61-90', amount: 0 as Dollars, count: 0 },
    { label: '90+', amount: 0 as Dollars, count: 0 },
  ];
  invoiceQueue.forEach((invoice) => {
    const bucket =
      invoice.daysOutstanding === 0
        ? arAging[0]
        : invoice.daysOutstanding <= 30
          ? arAging[1]
          : invoice.daysOutstanding <= 60
            ? arAging[2]
            : invoice.daysOutstanding <= 90
              ? arAging[3]
              : arAging[4];
    bucket.amount = (Number(bucket.amount) + Number(invoice.amount)) as Dollars;
    bucket.count += 1;
  });

  const dueToday = new Date(`${today}T00:00:00`);
  const dueThisWeekEnd = addDays(dueToday, 7);
  const nextWeekEnd = addDays(dueToday, 14);
  const thirtyDaysEnd = addDays(dueToday, 30);
  const datedVehicles = fleetVehicles
    .map((vehicle) => ({
      vehicle,
      due: vehicle.next_service_date ? parseISO(`${vehicle.next_service_date}T00:00:00`) : null,
    }))
    .filter(({ due }) => due && !Number.isNaN(due.getTime()));
  const overduePms = datedVehicles.filter(({ due }) => due! < dueToday).length;
  const dueThisWeek = datedVehicles.filter(
    ({ due }) => due! >= dueToday && due! <= dueThisWeekEnd
  ).length;
  const nextWeek = datedVehicles.filter(
    ({ due }) => due! > dueThisWeekEnd && due! <= nextWeekEnd
  ).length;
  const thirtyDays = datedVehicles.filter(
    ({ due }) => due! >= dueToday && due! <= thirtyDaysEnd
  ).length;

  const dayMs = 24 * 60 * 60 * 1000;
  const clientNameById = new Map(
    fleetClients.map((client) => [client.id, client.company_name || 'Fleet customer'])
  );
  const vehicleCompliance: FleetVehiclePmCompliance[] = fleetVehicles.map((vehicle) => {
    const due = vehicle.next_service_date
      ? parseISO(`${vehicle.next_service_date}T00:00:00`)
      : null;
    const daysUntilDue =
      due && !Number.isNaN(due.getTime())
        ? Math.ceil((due.getTime() - dueToday.getTime()) / dayMs)
        : null;
    const dueStatus: FleetVehiclePmCompliance['dueStatus'] =
      daysUntilDue === null
        ? 'unknown'
        : daysUntilDue < 0
          ? 'overdue'
          : daysUntilDue <= 7
            ? 'due_this_week'
            : daysUntilDue <= 30
              ? 'upcoming'
              : 'current';
    const vehicleLabel = [
      vehicle.unit_number ? `Unit ${vehicle.unit_number}` : null,
      vehicle.year,
      vehicle.make,
      vehicle.model,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      vehicleId: vehicle.id,
      customerId: vehicle.fleet_client_id || 'unassigned',
      customerName: clientNameById.get(vehicle.fleet_client_id || '') || 'Unassigned fleet',
      vehicleLabel: vehicleLabel || 'Fleet vehicle',
      pmCompliance:
        dueStatus === 'overdue'
          ? 0
          : dueStatus === 'due_this_week'
            ? 70
            : dueStatus === 'upcoming'
              ? 90
              : dueStatus === 'unknown'
                ? 50
                : 100,
      dueStatus,
      lastServiceDate: vehicle.last_service_date,
      nextServiceDate: vehicle.next_service_date,
      mileage: vehicle.mileage,
    };
  });

  const toPmQueueItem = (vehicle: FleetVehiclePmCompliance): FleetPmQueueItem => {
    const due = vehicle.nextServiceDate ? parseISO(`${vehicle.nextServiceDate}T00:00:00`) : null;
    const daysUntilDue =
      due && !Number.isNaN(due.getTime())
        ? Math.ceil((due.getTime() - dueToday.getTime()) / dayMs)
        : null;
    const recommendation =
      vehicle.dueStatus === 'overdue'
        ? 'Create estimate and request fleet approval before dispatch.'
        : vehicle.dueStatus === 'due_this_week'
          ? 'Schedule PM this week and pre-authorize recommended services.'
          : 'Prepare PM estimate and reserve route capacity.';

    return {
      vehicleId: vehicle.vehicleId,
      customerId: vehicle.customerId,
      customerName: vehicle.customerName,
      vehicleLabel: vehicle.vehicleLabel,
      nextServiceDate: vehicle.nextServiceDate,
      daysUntilDue,
      complianceScore: vehicle.pmCompliance,
      recommendation,
      approvalUrl: `/fleet-os/work-orders/new?fleetVehicleId=${vehicle.vehicleId}&approvalRequired=true`,
      estimateUrl: `/estimates/new?fleetVehicleId=${vehicle.vehicleId}&fleetClientId=${vehicle.customerId}`,
    };
  };
  const sortedQueueItems = vehicleCompliance
    .filter((vehicle) => vehicle.dueStatus !== 'current' && vehicle.dueStatus !== 'unknown')
    .map(toPmQueueItem)
    .sort((a, b) => (a.daysUntilDue ?? 999) - (b.daysUntilDue ?? 999));
  const pmQueues: FleetPmQueues = {
    overdue: sortedQueueItems.filter((item) => (item.daysUntilDue ?? 0) < 0),
    dueThisWeek: sortedQueueItems.filter(
      (item) => (item.daysUntilDue ?? 999) >= 0 && (item.daysUntilDue ?? 999) <= 7
    ),
    upcoming: sortedQueueItems.filter(
      (item) => (item.daysUntilDue ?? 999) > 7 && (item.daysUntilDue ?? 999) <= 14
    ),
    thirtyDays: sortedQueueItems.filter(
      (item) => (item.daysUntilDue ?? 999) >= 0 && (item.daysUntilDue ?? 999) <= 30
    ),
  };

  const fleetSchedule: FleetScheduleItem[] = todayFleetOrders.map((wo, index) => ({
    id: wo.id,
    time: wo.scheduled_time,
    customerName: wo.fleet_clients?.company_name || 'Fleet customer',
    vehicleCount: wo.fleet_vehicle_id ? 1 : 0,
    assignedTechnician: wo.technicians?.name || null,
    route: `Route ${index + 1}`,
    etaMinutes: wo.status === 'traveling' || wo.status === 'en_route' ? 15 + index * 5 : null,
    status: wo.status || 'new',
  }));

  const attentionByClient = new Map<string, FleetAttentionGroup>();
  const ensureAttention = (
    customerId: string | null,
    customerName?: string | null
  ): FleetAttentionGroup => {
    const id = customerId || 'unassigned';
    if (!attentionByClient.has(id)) {
      attentionByClient.set(id, {
        customerId: id,
        customerName: customerName || 'Unassigned fleet',
        overduePm: 0,
        dueThisWeek: 0,
        upcomingPm: 0,
        waitingApproval: 0,
      });
    }
    return attentionByClient.get(id)!;
  };
  datedVehicles.forEach(({ vehicle, due }) => {
    const group = ensureAttention(
      vehicle.fleet_client_id,
      fleetClients.find((c) => c.id === vehicle.fleet_client_id)?.company_name
    );
    if (due! < dueToday) group.overduePm += 1;
    else if (due! <= dueThisWeekEnd) group.dueThisWeek += 1;
    else if (due! <= thirtyDaysEnd) group.upcomingPm += 1;
  });
  waitingApprovalOrders.forEach((wo) => {
    ensureAttention(wo.fleet_client_id, wo.fleet_clients?.company_name).waitingApproval += 1;
  });
  const fleetAttention = Array.from(attentionByClient.values())
    .filter((g) => g.overduePm || g.dueThisWeek || g.upcomingPm || g.waitingApproval)
    .slice(0, 8);

  const pipelineStages: FleetPipelineStage[] = [
    'New',
    'Assigned',
    'Traveling',
    'On Site',
    'Waiting Approval',
    'Completed',
    'Invoiced',
  ].map((stage) => ({ stage: stage as FleetPipelineStage['stage'], count: 0 }));
  fleetWorkOrders.forEach((wo) => {
    const stage = PIPELINE_STATUS_MAP[wo.status || ''] || 'New';
    const entry = pipelineStages.find((item) => item.stage === stage);
    if (entry) entry.count += 1;
  });

  const activeOrderByTech = new Map<string, FleetWorkOrderRow>();
  fleetWorkOrders.forEach((wo) => {
    if (
      wo.assigned_technician_id &&
      ['assigned', 'traveling', 'en_route', 'in_progress', 'on_site', 'waiting_approval'].includes(
        wo.status || ''
      )
    ) {
      activeOrderByTech.set(wo.assigned_technician_id, wo);
    }
  });
  const fleetTechnicianStatus: FleetTechnicianStatus[] = fleetTechnicians.map((tech) => {
    const order = activeOrderByTech.get(tech.id);
    const mappedStatus = order?.status
      ? PIPELINE_STATUS_MAP[order.status]
      : TECH_STATUS_MAP[tech.status || 'offline'] || 'Offline';
    return {
      id: tech.id,
      name: tech.name || 'Technician',
      status:
        mappedStatus === 'Traveling'
          ? 'Driving'
          : mappedStatus === 'On Site'
            ? 'On Site'
            : TECH_STATUS_MAP[tech.status || 'offline'] || 'Offline',
      currentWorkOrder: order?.id || null,
      etaMinutes: order?.status === 'traveling' || order?.status === 'en_route' ? 15 : null,
      currentLocation: tech.current_location || null,
    };
  });

  const inventorySummary: FleetInventorySummary = fleetInventory.reduce(
    (summary, item) => {
      const category =
        `${item.inventory_items?.category || item.inventory_items?.name || ''}`.toLowerCase();
      const low = Number(item.quantity) <= Number(item.min_quantity || 0);
      if (low) summary.lowInventory += 1;
      if (category.includes('oil')) summary.oilGrades += 1;
      else if (category.includes('filter')) summary.filters += 1;
      else if (category.includes('plug')) summary.drainPlugs += 1;
      else summary.shopSupplies += 1;
      return summary;
    },
    { lowInventory: 0, oilGrades: 0, filters: 0, drainPlugs: 0, shopSupplies: 0 }
  );

  const availableInventoryByCategory = fleetInventory.reduce(
    (summary, item) => {
      const category =
        `${item.inventory_items?.category || item.inventory_items?.name || ''}`.toLowerCase();
      const qty = Number(item.quantity) || 0;
      if (category.includes('oil')) summary['Oil Grades'] += qty;
      else if (category.includes('filter')) summary.Filters += qty;
      else if (category.includes('plug')) summary['Drain Plugs'] += qty;
      else summary['Shop Supplies'] += qty;
      return summary;
    },
    { 'Oil Grades': 0, Filters: 0, 'Drain Plugs': 0, 'Shop Supplies': 0 } as Record<
      FleetInventoryRequirement['category'],
      number
    >
  );
  const requirementCategories: FleetInventoryRequirement['category'][] = [
    'Oil Grades',
    'Filters',
    'Drain Plugs',
    'Shop Supplies',
  ];
  const buildRouteRequirements = (vehicleCount: number): FleetInventoryRequirement[] =>
    requirementCategories.map((category) => {
      const required =
        category === 'Oil Grades'
          ? vehicleCount
          : category === 'Filters'
            ? vehicleCount
            : category === 'Drain Plugs'
              ? Math.ceil(vehicleCount / 2)
              : Math.max(1, Math.ceil(vehicleCount / 3));
      const available = availableInventoryByCategory[category];
      return { category, required, available, shortage: Math.max(required - available, 0) };
    });
  const inventoryReadiness: FleetInventoryReadiness = {
    routes: fleetSchedule.map((route) => {
      const requirements = buildRouteRequirements(Math.max(route.vehicleCount, 1));
      return {
        route: route.route || 'Route TBD',
        workOrderId: route.id,
        customerName: route.customerName,
        vehicleCount: route.vehicleCount,
        ready: requirements.every((requirement) => requirement.shortage === 0),
        requirements,
        receiveInventoryUrl: `/inventory?receive=true&workOrderId=${route.id}`,
        replenishUrl: `/inventory?replenish=true&workOrderId=${route.id}`,
      };
    }),
    lowStockReplenishment: requirementCategories
      .map((category) => {
        const totalShortage = fleetSchedule
          .flatMap((route) => buildRouteRequirements(Math.max(route.vehicleCount, 1)))
          .filter((requirement) => requirement.category === category)
          .reduce((sum, requirement) => sum + requirement.shortage, 0);
        return {
          category,
          shortage: totalShortage,
          receiveInventoryUrl: `/inventory?receive=true&category=${encodeURIComponent(category)}`,
          replenishUrl: `/inventory?replenish=true&category=${encodeURIComponent(category)}`,
        };
      })
      .filter((item) => item.shortage > 0),
  };

  const customerHealth: FleetCustomerHealth[] = fleetClients.slice(0, 5).map((client) => {
    const clientVehicles = fleetVehicles.filter((vehicle) => vehicle.fleet_client_id === client.id);
    const clientOrders = fleetWorkOrders.filter((wo) => wo.fleet_client_id === client.id);
    const clientCompliance = vehicleCompliance.filter(
      (vehicle) => vehicle.customerId === client.id
    );
    const completedOrders = clientOrders.filter(
      (wo) =>
        wo.completed_at ||
        wo.status === 'completed' ||
        wo.status === 'invoiced' ||
        wo.status === 'paid'
    );
    const lifetimeRevenue = completedOrders.reduce((sum, wo) => sum + (Number(wo.total) || 0), 0);
    return {
      customerId: client.id,
      customerName: client.company_name || 'Fleet customer',
      pmCompliance:
        clientCompliance.length > 0
          ? Math.round(
              clientCompliance.reduce((sum, vehicle) => sum + vehicle.pmCompliance, 0) /
                clientCompliance.length
            )
          : 100,
      outstandingAr: clientOrders
        .filter((wo) => wo.invoice_status && wo.invoice_status !== 'paid')
        .reduce((sum, wo) => sum + (Number(wo.total) || 0), 0),
      lastVisit:
        completedOrders.sort((a, b) =>
          `${b.completed_at || ''}`.localeCompare(`${a.completed_at || ''}`)
        )[0]?.completed_at || null,
      lifetimeRevenue,
      monthlyAverageRevenue: lifetimeRevenue > 0 ? Math.round(lifetimeRevenue / 12) : 0,
    };
  });

  const mapPoints: FleetMapPoint[] = [
    ...fleetTechnicianStatus.map((tech) => ({
      id: tech.id,
      label: tech.name,
      type: 'technician' as const,
      status: tech.status,
      route: null as string | null,
      etaMinutes: tech.etaMinutes,
      location: tech.currentLocation,
    })),
    ...todayFleetOrders.map((wo, index) => ({
      id: wo.id,
      label: wo.fleet_clients?.company_name || 'Fleet stop',
      type: 'customer' as const,
      status: wo.status || 'scheduled',
      route: `Route ${index + 1}`,
      etaMinutes: wo.status === 'traveling' || wo.status === 'en_route' ? 15 + index * 5 : null,
      location:
        wo.fleet_locations?.latitude && wo.fleet_locations?.longitude
          ? { lat: Number(wo.fleet_locations.latitude), lng: Number(wo.fleet_locations.longitude) }
          : null,
    })),
    ...fleetSchedule.map((item) => ({
      id: `stop-${item.id}`,
      label: item.customerName,
      type: 'stop' as const,
      status: item.status,
      route: item.route,
      etaMinutes: item.etaMinutes,
      location: null as { lat: number; lng: number } | null,
    })),
  ];
  const liveRouteActions: FleetLiveRouteAction[] = fleetSchedule.map((item) => ({
    workOrderId: item.id,
    route: item.route || 'Route TBD',
    customerName: item.customerName,
    assignedTechnician: item.assignedTechnician,
    etaMinutes: item.etaMinutes,
    reassignUrl: `/dispatch?reassignWorkOrderId=${item.id}`,
    availabilityUrl: `/team-os?availabilityForWorkOrderId=${item.id}`,
  }));
  const fleetHealthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 - overduePms * 3 - waitingApprovalOrders.length * 2 - invoicedOrders.length)
    )
  );
  const fleetOperations: FleetOperationsDashboard = {
    kpis: {
      fleetCustomers: fleetClients.length,
      techniciansWorking: fleetTechnicianStatus.filter((tech) => tech.status !== 'Offline').length,
      vehiclesScheduledToday: todayFleetOrders.filter((wo) => wo.fleet_vehicle_id).length,
      overduePms,
      fleetHealthScore,
      scheduledRevenueToday: scheduledFleetRevenue,
      completedRevenueToday: completedFleetRevenue,
      pendingApprovalRevenue,
    },
    schedule: fleetSchedule,
    attention: fleetAttention,
    pipeline: pipelineStages,
    technicians: fleetTechnicianStatus,
    pmForecast: { today: overduePms, thisWeek: dueThisWeek, nextWeek, thirtyDays },
    pmQueues,
    vehicleCompliance,
    revenueCommand: {
      forecast30Days,
      approvalDollars: pendingApprovalRevenue,
      outstandingAr: fleetOutstandingAr,
      arAging,
      invoiceQueue,
    },
    customerHealth,
    inventory: inventorySummary,
    inventoryReadiness,
    mapPoints,
    liveRouteActions,
    panels: {
      schedule: panelState(
        fleetSchedule,
        'No fleet work orders scheduled today.',
        fleetWorkOrdersRes.error
      ),
      attention: panelState(
        fleetAttention,
        'No fleet customers need attention right now.',
        fleetWorkOrdersRes.error || fleetVehiclesRes.error
      ),
      pipeline: panelState(
        fleetWorkOrders,
        'No fleet work orders in the 30-day pipeline.',
        fleetWorkOrdersRes.error
      ),
      technicians: panelState(
        fleetTechnicianStatus,
        'No active technicians are available for dispatch.',
        fleetTechsRes.error
      ),
      revenue: panelState(
        todayFleetOrders,
        'No scheduled fleet revenue today.',
        fleetWorkOrdersRes.error
      ),
      pmForecast: panelState(
        datedVehicles,
        'No fleet PM due dates are currently tracked.',
        fleetVehiclesRes.error
      ),
      customerHealth: panelState(
        customerHealth,
        'No active fleet customers found.',
        fleetClientsRes.error
      ),
      inventory: panelState(
        fleetInventory,
        'No van inventory records found.',
        fleetInventoryRes.error
      ),
      map: panelState(
        mapPoints,
        'No technician or stop locations available.',
        fleetTechsRes.error || fleetWorkOrdersRes.error
      ),
    },
  };

  return {
    revenueToday: sumNetCollectedDollars(
      payToday.data as Array<{ net_collected_cents: number | null }> | null
    ),
    revenueWeek: sumNetCollectedDollars(
      payWeek.data as Array<{ net_collected_cents: number | null }> | null
    ),
    revenueMonth: sumNetCollectedDollars(
      payMonth.data as Array<{ net_collected_cents: number | null }> | null
    ),
    revenueYTD: sumNetCollectedDollars(
      payYTD.data as Array<{ net_collected_cents: number | null }> | null
    ),
    revenueTodayPrev: sumNetCollectedDollars(
      payYesterday.data as Array<{ net_collected_cents: number | null }> | null
    ),
    revenueMonthPrev: sumNetCollectedDollars(
      payPrevMonth.data as Array<{ net_collected_cents: number | null }> | null
    ),
    outstandingAR,
    jobsInProgress: jobsInProgressList.length,
    jobsCompletedToday: completedToday.count || 0,
    appointmentsToday: todaysAppointments.length,
    unpaidInvoices,
    todaysAppointments,
    upcomingNext7,
    jobsInProgressList,
    serviceTypeRevenueMTD,
    fleetOperations,
  };
}
