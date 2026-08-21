import { collapseTechFleetJobs, rollupTechFleetJobStatus, techFleetJobLabel } from "@/lib/tech-job-groups";

describe("collapseTechFleetJobs", () => {
  const wo = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    is_fleet: true,
    fleet_job_id: "job-1",
    fleet_job_number: "FJ-00001",
    status,
    dispatch_status: status,
    scheduled_time: "08:00:00",
    ...extra,
  });

  it("collapses children of the same fleet job into one stop at the first child position", () => {
    const stops = collapseTechFleetJobs([
      { id: "appt-1", is_fleet: false, status: "confirmed", dispatch_status: "assigned", scheduled_time: "07:00:00" },
      wo("w1", "assigned"),
      wo("w2", "assigned"),
      wo("w3", "completed"),
      { id: "appt-2", is_fleet: false, status: "scheduled", dispatch_status: "scheduled", scheduled_time: "09:00:00" },
    ]);

    expect(stops.map((stop) => stop.id)).toEqual(["appt-1", "w1", "appt-2"]);
    const group = stops[1];
    expect(group.fleet_children?.map((child) => child.id)).toEqual(["w1", "w2", "w3"]);
    expect(group.fleet_vehicle_count).toBe(3);
    expect(group.fleet_job_number).toBe("FJ-00001");
  });

  it("picks the first open child as representative and rolls status up the ladder", () => {
    const stops = collapseTechFleetJobs([wo("w1", "completed"), wo("w2", "en_route"), wo("w3", "assigned")]);

    expect(stops).toHaveLength(1);
    expect(stops[0].id).toBe("w2");
    expect(stops[0].status).toBe("en_route");
    expect(stops[0].dispatch_status).toBe("en_route");
  });

  it("uses the DB vehicle count when it exceeds the visible children", () => {
    const stops = collapseTechFleetJobs([wo("w1", "assigned", { fleet_vehicle_count: 25 })]);

    expect(stops).toHaveLength(1);
    expect(stops[0].fleet_vehicle_count).toBe(25);
  });

  it("leaves standalone fleet work orders and appointments untouched", () => {
    const stops = collapseTechFleetJobs([
      { id: "w9", is_fleet: true, fleet_job_id: null, status: "assigned", dispatch_status: "assigned" },
      { id: "a1", is_fleet: false, status: "scheduled", dispatch_status: "scheduled" },
    ]);

    expect(stops.map((stop) => stop.id)).toEqual(["w9", "a1"]);
    expect(stops[0].fleet_children).toBeUndefined();
  });

  it("keeps separate fleet jobs as separate stops", () => {
    const stops = collapseTechFleetJobs([
      wo("w1", "assigned"),
      { ...wo("w2", "assigned"), fleet_job_id: "job-2", fleet_job_number: "FJ-00002" },
    ]);

    expect(stops).toHaveLength(2);
    expect(stops[0].fleet_job_id).toBe("job-1");
    expect(stops[1].fleet_job_id).toBe("job-2");
  });
});

describe("rollupTechFleetJobStatus", () => {
  it("completes only when every child is terminal", () => {
    expect(
      rollupTechFleetJobStatus([
        { id: "1", status: "completed" },
        { id: "2", status: "completed" },
      ]),
    ).toBe("completed");
    expect(
      rollupTechFleetJobStatus([
        { id: "1", status: "completed" },
        { id: "2", status: "assigned" },
      ]),
    ).toBe("assigned");
  });

  it("prefers the most advanced active state and detects full cancellation", () => {
    expect(
      rollupTechFleetJobStatus([
        { id: "1", status: "en_route" },
        { id: "2", status: "in_progress" },
      ]),
    ).toBe("in_progress");
    expect(
      rollupTechFleetJobStatus([
        { id: "1", status: "cancelled" },
        { id: "2", status: "cancelled" },
      ]),
    ).toBe("cancelled");
  });
});

describe("techFleetJobLabel", () => {
  it("renders the job number with a pluralized vehicle count", () => {
    expect(techFleetJobLabel({ fleet_job_number: "FJ-00007", fleet_vehicle_count: 5 })).toBe("FJ-00007 · 5 vehicles");
    expect(techFleetJobLabel({ fleet_job_number: "FJ-00007", fleet_vehicle_count: 1 })).toBe("FJ-00007 · 1 vehicle");
    expect(techFleetJobLabel({ fleet_job_number: null, fleet_vehicle_count: null })).toBeNull();
  });
});
