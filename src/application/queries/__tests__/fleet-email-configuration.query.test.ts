jest.mock("@/lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

import { apiClient } from "@/lib/api-client";
import { fetchFleetMailboxConfiguration } from "../fleet-email.query";

describe("fetchFleetMailboxConfiguration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads the active workspace connection status from Settings", async () => {
    const status = { workspace_user_id: "owner-1", smtp_configured: true, imap_configured: true };
    (apiClient.get as jest.Mock).mockResolvedValue({ data: status });
    await expect(fetchFleetMailboxConfiguration()).resolves.toEqual(status);
    expect(apiClient.get).toHaveBeenCalledWith("/v1/fleet/email/mailbox-configuration");
  });

  it("surfaces configuration lookup failures", async () => {
    const error = new Error("settings unavailable");
    (apiClient.get as jest.Mock).mockRejectedValue(error);
    await expect(fetchFleetMailboxConfiguration()).rejects.toBe(error);
  });
});
