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
}));

import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { fetchTrackingSettings } from "@/application/queries/tracking-settings.query";

const get = apiClient.get as jest.Mock;
const mockGetUser = getCurrentAuthUser as jest.Mock;

describe("fetchTrackingSettings", () => {
  beforeEach(() => {
    get.mockReset();
    mockGetUser.mockReset();
  });

  it("scopes owner tracking settings to the authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    get.mockResolvedValue({ enabled: true, ga4_measurement_id: "G-ABC123" });

    const result = await fetchTrackingSettings();

    expect(result).toEqual({ enabled: true, ga4_measurement_id: "G-ABC123" });
    expect(get).toHaveBeenCalledWith("/v1/platform/tracking-settings");
  });

  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(fetchTrackingSettings()).rejects.toThrow("Not authenticated");
  });
});
