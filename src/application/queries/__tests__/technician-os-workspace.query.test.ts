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

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentAuthUser: jest.fn(),
  resetCurrentAuthUserCache: jest.fn(),
}));

import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser, resetCurrentAuthUserCache } from "@/lib/auth/current-user";
import { fetchTeamOsTechnicianSnapshot, getCurrentUser } from "../technician-os.query";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const mockGetUser = getCurrentAuthUser as jest.Mock;

describe("Team OS workspace identity", () => {
  beforeEach(() => {
    (resetCurrentAuthUserCache as jest.Mock).mockClear();
    mockGetUser.mockReset();
    get.mockReset();
    post.mockReset();
  });

  it("uses the active workspace owner for manager-facing technician data", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "manager-1", email: "manager@example.com" } } });
    get.mockResolvedValue({ data: { owner_user_id: "owner-1" } });

    await expect(getCurrentUser()).resolves.toMatchObject({ id: "owner-1", email: "manager@example.com" });
    expect(get).toHaveBeenCalledWith("/v1/tech-os/workspace-owner");
  });

  it("returns null when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("loads canonical technician metrics for an explicit period", async () => {
    const rows = [{ technician_id: "tech-1", completed_jobs: 3, collected_revenue: 450 }];
    post.mockResolvedValue({ data: rows });

    await expect(fetchTeamOsTechnicianSnapshot("2026-07-01", "2026-07-31")).resolves.toEqual(rows);
    expect(post).toHaveBeenCalledWith("/v1/tech-os/snapshot", {
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });
});
