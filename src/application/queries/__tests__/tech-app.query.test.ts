import { jest } from "@jest/globals";

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

const fetchOperationalJobsByDateRangeMock = jest.fn(
  async (_userId: string, _fromDate: string, _toDate: string) => ({ data: [], error: null }),
);

jest.mock("../operational-jobs.query", () => ({
  fetchOperationalJobsByDateRange: (userId: string, fromDate: string, toDate: string) =>
    fetchOperationalJobsByDateRangeMock(userId, fromDate, toDate),
}));

import { apiClient } from "@/lib/api-client";
import { fetchTechTodayData, fetchTechnicianAppContext, fetchTechnicianJobWorkspace } from "../tech-app.query";

const post = apiClient.post as jest.Mock;
const get = apiClient.get as jest.Mock;

describe("tech-app.query identity scope", () => {
  beforeEach(() => {
    fetchOperationalJobsByDateRangeMock.mockClear();
    post.mockReset();
    get.mockReset();
    get.mockResolvedValue({ data: [] });
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

  it("loads identity and job access through canonical API contracts", async () => {
    post
      .mockResolvedValueOnce({ data: { technician_id: "tech-1", workspace_user_id: "owner-1", access_state: "linked" } })
      .mockResolvedValueOnce({ data: { job_id: "job-1", source: "fleet_work_order" } });
    await expect(fetchTechnicianAppContext()).resolves.toMatchObject({ technician_id: "tech-1", access_state: "linked" });
    await expect(fetchTechnicianJobWorkspace("job-1")).resolves.toMatchObject({ source: "fleet_work_order" });
    expect(post).toHaveBeenLastCalledWith("/v1/tech-app/job-workspace", { job_id: "job-1" });
  });
});
