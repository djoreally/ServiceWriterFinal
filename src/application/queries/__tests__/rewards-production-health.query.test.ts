import { fetchRewardsProductionHealth, validateRewardsLaunchSignoff } from "../rewards-production-health.query";
import { apiClient } from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

describe("rewards production health queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches provider production health through the API boundary", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: { status: "ok", launch_gate_status: "ready_for_launch_signoff" },
    });

    await expect(fetchRewardsProductionHealth("provider-1")).resolves.toEqual({
      status: "ok",
      launch_gate_status: "ready_for_launch_signoff",
    });
    expect(apiClient.get).toHaveBeenCalledWith("/v1/crm/loyalty/production-health", {
      query: { provider_id: "provider-1" },
    });
  });

  it("validates launch signoff through the API boundary", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: { status: "pass" },
    });

    await expect(validateRewardsLaunchSignoff("provider-1")).resolves.toEqual({ status: "pass" });
    expect(apiClient.get).toHaveBeenCalledWith("/v1/crm/loyalty/launch-signoff", {
      query: { provider_id: "provider-1" },
    });
  });
});
