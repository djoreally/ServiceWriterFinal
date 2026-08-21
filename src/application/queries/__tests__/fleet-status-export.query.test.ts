import { describe, expect, it, jest } from "@jest/globals";
import { fetchFleetStatusExportRows } from "../fleet-status-export.query";

jest.mock("../operational-jobs.query", () => ({
  fetchOperationalJobsByDate: jest.fn(async () => ({
    data: [
      {
        job_id: "job_1",
        scheduled_date: "2026-04-10",
        scheduled_time: "09:00:00",
        canonical_state: "assigned",
        assigned_technician_id: "tech_1",
        assigned_technician_name: "Alex",
        customer_name: "Fleet Co",
        location_address: "123 Main St",
        last_event_at: "2026-04-10T09:00:00Z",
        source_freshness_ms: 1200,
      },
    ],
  })),
}));

describe("fetchFleetStatusExportRows", () => {
  it("maps canonical fleet-facing export rows from operational view", async () => {
    const rows = await fetchFleetStatusExportRows("tenant_1", "2026-04-10");
    expect(rows).toEqual([
      {
        job_id: "job_1",
        scheduled_date: "2026-04-10",
        scheduled_time: "09:00:00",
        canonical_state: "assigned",
        assigned_technician_id: "tech_1",
        assigned_technician_name: "Alex",
        customer_name: "Fleet Co",
        location_address: "123 Main St",
        last_event_at: "2026-04-10T09:00:00Z",
        source_freshness_ms: 1200,
      },
    ]);
  });
});
