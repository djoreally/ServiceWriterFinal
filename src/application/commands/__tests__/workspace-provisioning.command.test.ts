jest.mock("@/lib/api-client", () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

import { apiClient } from "@/lib/api-client";
import { provisionOwnerWorkspace } from "@/application/commands/workspace-provisioning.command";
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from "@/lib/legal";

const post = apiClient.post as jest.Mock;

describe("provisionOwnerWorkspace", () => {
  beforeEach(() => post.mockReset());

  it("posts the trimmed business name and current legal versions to the provisioning route", async () => {
    post.mockResolvedValue({
      data: { workspace_id: "ws-1", slug: "moms-mobile-oil-change", created: true },
    });

    const result = await provisionOwnerWorkspace("  MOMS Mobile Oil Change  ");

    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/v1/platform/workspaces/provision-owner");
    expect(body.businessName).toBe("MOMS Mobile Oil Change");
    expect(body.termsVersion).toBe(TERMS_OF_SERVICE_VERSION);
    expect(body.privacyVersion).toBe(PRIVACY_POLICY_VERSION);
    expect(typeof body.timezone).toBe("string");
    expect(result).toEqual({ workspaceId: "ws-1", slug: "moms-mobile-oil-change", created: true });
  });

  it("reports created=false when the account already owned a workspace (idempotent retry)", async () => {
    post.mockResolvedValue({
      data: { workspace_id: "ws-1", slug: "moms-mobile-oil-change", created: false },
    });

    const result = await provisionOwnerWorkspace("MOMS Mobile Oil Change");

    expect(result).toEqual({ workspaceId: "ws-1", slug: "moms-mobile-oil-change", created: false });
  });

  it("throws on an incomplete provisioning response instead of pretending success", async () => {
    post.mockResolvedValue({ data: {} });

    await expect(provisionOwnerWorkspace("MOMS Mobile Oil Change"))
      .rejects.toThrow("Workspace provisioning response was incomplete.");
  });

  it("propagates route errors to the caller", async () => {
    post.mockRejectedValue(new Error("Business name is required"));

    await expect(provisionOwnerWorkspace(""))
      .rejects.toThrow("Business name is required");
  });
});
