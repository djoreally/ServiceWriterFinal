import type { FleetWorkOrderSummary } from "@/application/queries/fleet.query";
import { buildFleetJobGroups, rollupFleetJobStatus } from "@/lib/fleet-job-groups";

type StatusProbe = Pick<FleetWorkOrderSummary, "status" | "assigned_technician_id">;

function probe(status: string, assigned_technician_id: string | null = null): StatusProbe {
  return { status, assigned_technician_id } as StatusProbe;
}

function workOrder(overrides: Partial<FleetWorkOrderSummary> = {}): FleetWorkOrderSummary {
  return {
    id: "wo-1",
    fleet_job_id: null,
    status: "scheduled",
    assigned_technician_id: null,
    priority: "normal",
    total: 100,
    service_type: "Oil change",
    scheduled_date: "2026-09-23",
    scheduled_time: "09:00",
    created_at: "2026-09-22T10:00:00Z",
    updated_at: "2026-09-22T10:00:00Z",
    fleet_jobs: null,
    fleet_clients: null,
    fleet_locations: null,
    ...overrides,
  } as FleetWorkOrderSummary;
}

describe("fleet-job-groups", () => {
  describe("rollupFleetJobStatus", () => {
    it("returns scheduled for an empty job", () => {
      expect(rollupFleetJobStatus([])).toBe("scheduled");
    });

    it("returns cancelled only when every order is cancelled", () => {
      expect(rollupFleetJobStatus([probe("cancelled"), probe("canceled")])).toBe("cancelled");
      expect(rollupFleetJobStatus([probe("cancelled"), probe("scheduled")])).toBe("scheduled");
    });

    it("returns completed when all orders are terminal (cancelled counts as terminal)", () => {
      expect(
        rollupFleetJobStatus([probe("completed"), probe("invoiced"), probe("paid")]),
      ).toBe("completed");
      expect(rollupFleetJobStatus([probe("completed"), probe("cancelled")])).toBe("completed");
    });

    it("returns in_progress when any order is active", () => {
      expect(rollupFleetJobStatus([probe("scheduled"), probe("en_route")])).toBe(
        "in_progress",
      );
      expect(rollupFleetJobStatus([probe("completed"), probe("in_progress")])).toBe(
        "in_progress",
      );
    });

    it("returns assigned when a tech is assigned but nothing is active", () => {
      expect(rollupFleetJobStatus([probe("scheduled", "tech-1")])).toBe("assigned");
    });

    it("falls back to scheduled", () => {
      expect(rollupFleetJobStatus([probe("scheduled")])).toBe("scheduled");
    });
  });

  describe("buildFleetJobGroups", () => {
    it("groups orders by fleet_job_id and leaves the rest standalone", () => {
      const { groups, standalone } = buildFleetJobGroups([
        workOrder({ id: "wo-1", fleet_job_id: "job-1", total: 100 }),
        workOrder({ id: "wo-2", fleet_job_id: "job-1", total: 50 }),
        workOrder({ id: "wo-3", fleet_job_id: null }),
      ]);

      expect(groups).toHaveLength(1);
      expect(groups[0].jobId).toBe("job-1");
      expect(groups[0].orders).toHaveLength(2);
      expect(groups[0].total).toBe(150);
      expect(groups[0].status).toBe("scheduled");
      expect(standalone.map((o) => o.id)).toEqual(["wo-3"]);
    });

    it("escalates group priority to the highest child priority", () => {
      const { groups } = buildFleetJobGroups([
        workOrder({ id: "wo-1", fleet_job_id: "job-1", priority: "normal" }),
        workOrder({ id: "wo-2", fleet_job_id: "job-1", priority: "urgent" }),
      ]);
      expect(groups[0].priority).toBe("urgent");
    });

    it("rolls up child statuses and picks the earliest scheduled time", () => {
      const { groups } = buildFleetJobGroups([
        workOrder({
          id: "wo-1",
          fleet_job_id: "job-1",
          status: "in_progress",
          scheduled_time: "11:00",
        }),
        workOrder({
          id: "wo-2",
          fleet_job_id: "job-1",
          status: "scheduled",
          scheduled_time: "09:00",
        }),
      ]);
      expect(groups[0].status).toBe("in_progress");
      expect(groups[0].scheduledTime).toBe("09:00");
    });

    it("sums child durations with a 60-minute default", () => {
      const { groups } = buildFleetJobGroups([
        workOrder({ id: "wo-1", fleet_job_id: "job-1" }),
        workOrder({
          id: "wo-2",
          fleet_job_id: "job-1",
          scheduled_duration_minutes: 90,
        } as Partial<FleetWorkOrderSummary>),
      ]);
      expect(groups[0].durationMinutes).toBe(150);
    });
  });
});
