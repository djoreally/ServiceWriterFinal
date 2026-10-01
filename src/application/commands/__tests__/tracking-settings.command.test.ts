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
import { saveTrackingEnabled, saveTrackingSettings } from "@/application/commands/tracking-settings.command";

const put = apiClient.put as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const mockGetUser = getCurrentAuthUser as jest.Mock;

describe("tracking-settings commands", () => {
  beforeEach(() => {
    put.mockReset();
    patch.mockReset();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
  });

  it("persists only the master tracking switch for the authenticated user", async () => {
    patch.mockResolvedValue({});
    await saveTrackingEnabled(true);
    expect(patch).toHaveBeenCalledWith("/v1/platform/tracking-settings/enabled", { enabled: true });
  });

  it("saves full tracking settings", async () => {
    put.mockResolvedValue({});
    const settings = { enabled: true, ga4_measurement_id: "G-123" } as never;
    await saveTrackingSettings(settings);
    expect(put).toHaveBeenCalledWith("/v1/platform/tracking-settings", settings);
  });

  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(saveTrackingEnabled(true)).rejects.toThrow("Not authenticated");
  });
});
