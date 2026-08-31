import { jest } from "@jest/globals";

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          gte: jest.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

const fetchOperationalJobsByDateRangeMock = jest.fn(
  async (_userId: string, _fromDate: string, _toDate: string) => ({ data: [], error: null }),
);

jest.mock("../operational-jobs.query", () => ({
  fetchOperationalJobsByDateRange: (userId: string, fromDate: string, toDate: string) =>
    fetchOperationalJobsByDateRangeMock(userId, fromDate, toDate),
}));

import { fetchTechTodayData, fetchTechnicianAppContext, fetchTechnicianJobWorkspace } from "../tech-app.query";
import { supabase } from "@/integrations/supabase/client";

describe("tech-app.query identity scope", () => {
  beforeEach(() => {
    fetchOperationalJobsByDateRangeMock.mockClear();
  });

  it("uses businessUserId scope when available so assigned jobs resolve for technician users", async () => {
    await fetchTechTodayData({
      isAdmin: false,
      userId: "tech-auth-user-id",
      businessUserId: "owner-user-id",
      techId: "tech-1",
    });

    expect(fetchOperationalJobsByDateRangeMock).toHaveBeenCalled();
    const firstCall = fetchOperationalJobsByDateRangeMock.mock.calls[0];
    expect(firstCall[0]).toBe("owner-user-id");
  });

  it("loads identity and job access through canonical RPC contracts", async () => {
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({ data: { technician_id: "tech-1", workspace_user_id: "owner-1", access_state: "linked" }, error: null })
      .mockResolvedValueOnce({ data: { job_id: "job-1", source: "fleet_work_order" }, error: null });
    await expect(fetchTechnicianAppContext()).resolves.toMatchObject({ technician_id: "tech-1", access_state: "linked" });
    await expect(fetchTechnicianJobWorkspace("job-1")).resolves.toMatchObject({ source: "fleet_work_order" });
    expect(supabase.rpc).toHaveBeenLastCalledWith("get_technician_job_workspace_v1", { p_job_id: "job-1" });
  });
});
