/**
 * End-to-end dispatch assignment coverage.
 *
 * Every assignment surface (Dispatch Board, Quick Dispatch, Dispatch Monitor,
 * Fleet calendar slots, Fleet scored dispatch) is exercised against a single
 * in-memory backend that emulates the separate appointment and Fleet assignment RPCs plus the
 * `dispatch_operational_jobs_v1` read model. After each assignment we assert the
 * job appears on the correct technician dashboard as assigned, and that
 * unassignment returns it to the workspace queue as unassigned.
 */

import { supabase } from "@/integrations/supabase/client";

const mockOwner = "owner-user-id";
const TECH_A = "tech-a";
const TECH_B = "tech-b";
const TODAY = new Date().toISOString().slice(0, 10);

interface AppointmentRow {
  id: string;
  user_id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  dispatch_status: string;
  duration_minutes: number;
  assigned_technician_id: string | null;
  assigned_van_id: string | null;
  dispatch_notes: string | null;
  updated_at: string;
}

interface FleetRow {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  priority: string;
  service_type: string;
  description: string | null;
  total: number;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_technician_id: string | null;
  assigned_van_id: string | null;
  fleet_client_id: string;
  updated_at: string;
}

const mockStore: {
  appointments: AppointmentRow[];
  fleet_work_orders: FleetRow[];
  technicians: Array<{ id: string; name: string; is_active: boolean }>;
  fleet_activity_logs: Array<Record<string, unknown>>;
  rpcCalls: Array<{ name: string; args: any }>;
} = {
  appointments: [],
  fleet_work_orders: [],
  technicians: [],
  fleet_activity_logs: [],
  rpcCalls: [],
};

function mockResetStore() {
  mockStore.appointments = [
    {
      id: "appt-1",
      user_id: mockOwner,
      title: "Mobile oil change",
      scheduled_date: TODAY,
      scheduled_time: "09:00:00",
      status: "scheduled",
      dispatch_status: "unassigned",
      duration_minutes: 60,
      assigned_technician_id: null,
      assigned_van_id: null,
      dispatch_notes: null,
      updated_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "appt-2",
      user_id: mockOwner,
      title: "Brake inspection",
      scheduled_date: TODAY,
      scheduled_time: "13:00:00",
      status: "scheduled",
      dispatch_status: "unassigned",
      duration_minutes: 90,
      assigned_technician_id: null,
      assigned_van_id: null,
      dispatch_notes: null,
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ];
  mockStore.fleet_work_orders = [
    {
      id: "fwo-1",
      user_id: mockOwner,
      order_number: "FWO-1001",
      status: "scheduled",
      priority: "high",
      service_type: "Fleet oil service",
      description: "5 units",
      total: 480,
      scheduled_date: TODAY,
      scheduled_time: "10:30:00",
      assigned_technician_id: null,
      assigned_van_id: null,
      fleet_client_id: "client-1",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "fwo-2",
      user_id: mockOwner,
      order_number: "FWO-1002",
      status: "scheduled",
      priority: "normal",
      service_type: "Fleet inspection",
      description: null,
      total: 210,
      scheduled_date: TODAY,
      scheduled_time: null,
      assigned_technician_id: null,
      assigned_van_id: null,
      fleet_client_id: "client-2",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ];
  mockStore.technicians = [
    { id: TECH_A, name: "Tech A", is_active: true },
    { id: TECH_B, name: "Tech B", is_active: true },
  ];
  mockStore.fleet_activity_logs = [];
  mockStore.rpcCalls = [];
}

/** Emulates the domain-specific server-side assignment transactions. */
function mockApplyAssignment(args: any) {
  const appointmentId = args.p_appointment_id ?? (args.p_job_source === "appointment" ? args.p_job_id : null);
  const fleetWorkOrderId = args.p_work_order_id ?? (args.p_job_source === "fleet_work_order" ? args.p_job_id : null);
  const assigning = Boolean(args.p_technician_id ?? args.p_van_id);
  if (appointmentId) {
    const row = mockStore.appointments.find((a) => a.id === appointmentId);
    if (!row) return { data: null, error: { message: "Job not found" } };
    row.assigned_technician_id = args.p_technician_id ?? (assigning ? row.assigned_technician_id : null);
    row.assigned_van_id = args.p_van_id ?? (assigning ? row.assigned_van_id : null);
    row.dispatch_status = assigning ? "assigned" : "unassigned";
    row.status = assigning ? "confirmed" : "scheduled";
    if (args.p_date) row.scheduled_date = args.p_date;
    if (args.p_start) row.scheduled_time = args.p_start;
    if (args.p_notes) row.dispatch_notes = args.p_notes;
    row.updated_at = new Date().toISOString();
    return { data: { action: assigning ? "assigned" : "unassigned" }, error: null };
  }

  const row = mockStore.fleet_work_orders.find((f) => f.id === fleetWorkOrderId);
  if (!row) return { data: null, error: { message: "Job not found" } };
  if (args.p_expected_updated_at && args.p_expected_updated_at !== row.updated_at) {
    return { data: null, error: { message: "Work order changed since it was loaded" } };
  }
  row.assigned_technician_id = args.p_technician_id ?? null;
  row.assigned_van_id = args.p_van_id ?? null;
  row.status = assigning ? "assigned" : "scheduled";
  if (args.p_date) row.scheduled_date = args.p_date;
  if (args.p_start) row.scheduled_time = args.p_start;
  row.updated_at = new Date().toISOString();
  return { data: { action: assigning ? "assigned" : "unassigned" }, error: null };
}

/** Rows served by the unified dispatch_operational_jobs_v1 read model. */
function operationalJobRows() {
  const techName = (id: string | null) => mockStore.technicians.find((t) => t.id === id)?.name ?? null;
  const appts = mockStore.appointments.map((a) => ({
    job_id: a.id,
    user_id: a.user_id,
    title: a.title,
    scheduled_date: a.scheduled_date,
    scheduled_time: a.scheduled_time,
    status: a.status,
    dispatch_status: a.dispatch_status,
    canonical_state: a.dispatch_status === "assigned" ? "assigned" : "queued",
    assigned_technician_id: a.assigned_technician_id,
    assigned_technician_name: techName(a.assigned_technician_id),
    assigned_van_id: a.assigned_van_id,
    duration_minutes: a.duration_minutes,
    estimated_duration_minutes: a.duration_minutes,
    dispatch_notes: a.dispatch_notes,
    source: "appointment",
  }));
  const fleet = mockStore.fleet_work_orders.map((f) => ({
    job_id: f.id,
    user_id: f.user_id,
    title: f.service_type,
    scheduled_date: f.scheduled_date ?? TODAY,
    scheduled_time: f.scheduled_time ?? "08:00:00",
    status: f.status,
    dispatch_status: f.assigned_technician_id ? "assigned" : "unassigned",
    canonical_state: f.assigned_technician_id ? "assigned" : "queued",
    assigned_technician_id: f.assigned_technician_id,
    assigned_technician_name: techName(f.assigned_technician_id),
    assigned_van_id: f.assigned_van_id,
    duration_minutes: 60,
    estimated_duration_minutes: 60,
    dispatch_notes: null,
    source: "fleet_work_order",
  }));
  return [...appts, ...fleet];
}

function tableRows(table: string): any[] {
  switch (table) {
    case "workspace_members":
      return [{ workspace_id: "00000000-0000-4000-8000-000000000001", user_id: mockOwner, is_active: true }];
    case "dispatch_operational_jobs_v1":
      return operationalJobRows();
    case "appointments":
      return mockStore.appointments;
    case "fleet_work_orders":
      return mockStore.fleet_work_orders.map((f) => ({
        ...f,
        fleet_clients: { company_name: `Client ${f.fleet_client_id}` },
        fleet_locations: { name: "Yard", address: "1 Depot Way" },
        fleet_vehicles: { year: 2021, make: "Ford", model: "Transit", unit_number: "12", license_plate: null },
      }));
    case "technicians":
      return mockStore.technicians;
    case "time_clock_entries":
      return [];
    case "fleet_work_order_line_items":
      return [];
    default:
      return [];
  }
}

function mockCreateBuilder(table: string) {
  let rows = tableRows(table);
  const builder: any = {
    select: () => builder,
    order: () => builder,
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return builder;
    },
    eq: (col: string, value: unknown) => {
      rows = rows.filter((r) => r[col] === value);
      return builder;
    },
    neq: (col: string, value: unknown) => {
      rows = rows.filter((r) => r[col] !== value);
      return builder;
    },
    gte: (col: string, value: string) => {
      rows = rows.filter((r) => String(r[col] ?? "") >= value);
      return builder;
    },
    lte: (col: string, value: string) => {
      rows = rows.filter((r) => String(r[col] ?? "") <= value);
      return builder;
    },
    in: (col: string, values: unknown[]) => {
      rows = rows.filter((r) => values.includes(r[col]));
      return builder;
    },
    not: () => builder,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    insert: async (payload: Record<string, unknown>) => {
      if (table === "fleet_activity_logs") mockStore.fleet_activity_logs.push(payload);
      return { data: null, error: null };
    },
    then: (resolve: (value: { data: any[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return builder;
}

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: mockOwner } } }) },
    from: (table: string) => mockCreateBuilder(table),
    rpc: async (name: string, args: any) => {
      mockStore.rpcCalls.push({ name, args });
      if (name === "assign_dispatch_job_v1" || name === "assign_appointment_job_v1" || name === "assign_fleet_work_order_dispatch_v1") return mockApplyAssignment(args);
      if (name === "current_workspace_owner_user_id") return { data: mockOwner, error: null };
      if (name === "transition_fleet_work_order") return { data: null, error: null };
      return { data: null, error: null };
    },
    functions: { invoke: async () => ({ data: { success: true, ranked_candidates: [] }, error: null }) },
  },
}));

jest.mock("@/lib/nextApiClient", () => ({
  nextApi: {
    dispatch: {
      assign:       async (payload: any) => {
        const result = await supabase.rpc("assign_dispatch_job_v1", {

          p_job_source: payload.job_source,
          p_job_id: payload.job_id,
          p_technician_id: payload.technician_id,
          p_van_id: payload.van_id,
          p_date: payload.date,
          p_start: payload.start,
          p_duration_minutes: payload.duration_minutes,
          p_expected_updated_at: payload.expected_updated_at,
          p_notes: payload.notes,
        });
        if (result.error) throw new Error(result.error.message);
        return { data: result.data ?? null };
      },
    },
  },
}));

jest.mock("@/application/queries/job-thread.query", () => ({
  openCommunicationThreadsForJobs: jest.fn(async () => undefined),
}));

import {
  assignDispatchJob,
  assignTechnician,
  assignVan,
  unassignAppointment,
} from "../dispatch.command";
import { dispatchFleetWorkOrder, assignFleetWorkOrderWithOverride } from "../fleet-dispatch.command";
import { assignFleetWorkOrderSlot } from "@/application/queries/fleet-resource-scheduling.query";
import { assignTechnicianRpc } from "@/application/queries/dispatch-monitor.query";
import { assignDispatchJobRpc as quickDispatchAssign } from "@/application/queries/quick-dispatch.query";
import { fetchTechTodayData, fetchTechFleetAssignments } from "@/application/queries/tech-app.query";

const identity = (techId: string) => ({
  isAdmin: false,
  userId: `${techId}-auth`,
  businessUserId: mockOwner,
  techId,
});

async function techDashboardJobs(techId: string) {
  const { jobs } = await fetchTechTodayData(identity(techId));
  return jobs as Array<Record<string, any>>;
}

describe("dispatch assignment paths → technician dashboards (E2E)", () => {
  beforeEach(() => {
    mockResetStore();
    window.localStorage.setItem("servicewriter.selected_workspace_id", "00000000-0000-4000-8000-000000000001");
  });

  it("Dispatch Board technician assignment lands on the assigned technician dashboard only", async () => {
    await assignTechnician("appt-1", TECH_A, "Board drag-drop");

    const techAJobs = await techDashboardJobs(TECH_A);
    const techBJobs = await techDashboardJobs(TECH_B);

    expect(techAJobs.map((j) => j.id)).toContain("appt-1");
    expect(techAJobs.find((j) => j.id === "appt-1")?.dispatch_status).toBe("assigned");
    expect(techBJobs.map((j) => j.id)).not.toContain("appt-1");
    expect(mockStore.rpcCalls.filter((c) => c.name === "assign_dispatch_job_v1")).toHaveLength(1);
  });

  it("Dispatch Monitor and Quick Dispatch use the same audited assignment boundary", async () => {
    const monitor = await assignTechnicianRpc("appt-1", TECH_A, "monitor");
    const quick = await quickDispatchAssign({ jobSource: "appointment", jobId: "appt-2", technicianId: TECH_B, notes: "quick dispatch" });

    expect(monitor.error).toBeNull();
    expect(quick.error).toBeNull();
    expect(mockStore.rpcCalls.filter((c) => c.name === "assign_dispatch_job_v1")).toHaveLength(2);

    expect((await techDashboardJobs(TECH_A)).map((j) => j.id)).toEqual(["appt-1"]);
    expect((await techDashboardJobs(TECH_B)).map((j) => j.id)).toEqual(["appt-2"]);
  });

  it("rejects van-only assignment because Fleet dispatch is a separate product boundary", async () => {
    await expect(assignVan("appt-1", "van-1")).rejects.toThrow(/Fleet dispatch|not part of Service Writer Dispatch/i);
    expect(operationalJobRows().find((r) => r.job_id === "appt-1")?.assigned_van_id).toBeNull();
  });

  it("unassignment returns the appointment to the queue and removes it from the dashboard", async () => {
    await assignTechnician("appt-1", TECH_A);
    expect(await techDashboardJobs(TECH_A)).toHaveLength(1);

    await unassignAppointment("appt-1");

    expect(await techDashboardJobs(TECH_A)).toHaveLength(0);
    const board = operationalJobRows().find((r) => r.job_id === "appt-1");
    expect(board?.dispatch_status).toBe("unassigned");
    expect(board?.assigned_technician_id).toBeNull();
  });

  it("rejects Fleet calendar assignment because Fleet dispatch is a separate product boundary", async () => {
    await expect(assignFleetWorkOrderSlot({
      workOrderId: "fwo-1",
      technicianId: TECH_A,
      date: TODAY,
      start: "11:00:00",
      durationMinutes: 120,
      expectedUpdatedAt: "2026-08-01T00:00:00.000Z",
    })).rejects.toThrow(/Fleet dispatch is separated/i);
  });

  it("rejects scored Fleet dispatch because Fleet dispatch is a separate product boundary", async () => {
    await expect(dispatchFleetWorkOrder("fwo-2", TECH_B)).rejects.toThrow(/Fleet dispatch is separated/i);
  });

  it("rejects Fleet override dispatch because Fleet dispatch is a separate product boundary", async () => {
    await expect(assignFleetWorkOrderWithOverride({ workOrderId: "fwo-1", technicianId: TECH_A, overrideReason: "closest van" })).rejects.toThrow(/Fleet dispatch is separated/i);
    expect(mockStore.fleet_activity_logs).toHaveLength(0);
  });

  it("rejects Fleet optimistic-concurrency assignment because Fleet dispatch is a separate product boundary", async () => {
    await expect(assignFleetWorkOrderSlot({
      workOrderId: "fwo-1",
      technicianId: TECH_A,
      date: TODAY,
      start: "11:00:00",
      durationMinutes: 60,
      expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
    })).rejects.toThrow(/Fleet dispatch is separated/i);
  });

  it("unassigned jobs stay in the workspace queue and on no technician dashboard", async () => {
    expect(await techDashboardJobs(TECH_A)).toHaveLength(0);
    expect(await techDashboardJobs(TECH_B)).toHaveLength(0);

    const queue = operationalJobRows().filter((r) => r.dispatch_status === "unassigned");
    expect(queue.map((r) => r.job_id).sort()).toEqual(["appt-1", "appt-2", "fwo-1", "fwo-2"]);
  });

  it("reassignment moves the job between technician dashboards without duplication", async () => {
    await assignDispatchJob({ jobSource: "appointment", jobId: "appt-1", technicianId: TECH_A });
    await assignDispatchJob({ jobSource: "appointment", jobId: "appt-1", technicianId: TECH_B });

    expect(await techDashboardJobs(TECH_A)).toHaveLength(0);
    expect((await techDashboardJobs(TECH_B)).map((j) => j.id)).toEqual(["appt-1"]);
  });
});
