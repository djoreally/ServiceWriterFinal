jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  },
}));

jest.mock("@/application/queries/settings.query", () => ({
  resolveCurrentWorkspace: jest.fn(async () => ({ workspaceId: "workspace-1" })),
}));

import { apiClient } from "@/lib/api-client";
import { createServicePackage, updateServicePackage } from "@/application/commands/packages.command";

const payload = {
  name: "Full Service Package",
  description: "Oil change plus inspection",
  package_price: 99,
  discount_type: "fixed",
  discount_value: 20,
  is_active: true,
  estimated_duration: 90,
};

const items = [
  {
    service_catalog_id: "11111111-1111-1111-1111-111111111111",
    quantity: 2,
    override_price: null,
  },
  {
    service_catalog_id: "22222222-2222-2222-2222-222222222222",
    quantity: 1,
    override_price: 35,
  },
];

// The command posts to the canonical service-packages API; the Hono route
// forwards `items` to the upsert_service_package RPC as a JSONB array.
// These tests pin the client half of that contract: items travel as a
// real array, never a stringified JSON blob.
describe("service package commands", () => {
  const mockPost = apiClient.post as jest.Mock;

  beforeEach(() => {
    mockPost.mockReset();
  });

  it("creates packages with JSONB item arrays instead of stringified JSON", async () => {
    mockPost.mockResolvedValue({ data: "package-id" });

    await expect(createServicePackage(payload, items)).resolves.toBe("package-id");

    expect(mockPost).toHaveBeenCalledWith("/v1/platform/service-packages/upsert", {
      selected_workspace_id: "workspace-1",
      name: payload.name,
      description: payload.description,
      package_price: payload.package_price,
      discount_type: payload.discount_type,
      discount_value: payload.discount_value,
      is_active: payload.is_active,
      estimated_duration: payload.estimated_duration,
      items,
    });
    expect(typeof mockPost.mock.calls[0][1].items).not.toBe("string");
  });

  it("updates packages with JSONB item arrays instead of stringified JSON", async () => {
    mockPost.mockResolvedValue({ data: "package-id" });

    await expect(updateServicePackage("package-id", payload, items)).resolves.toBeUndefined();

    expect(mockPost).toHaveBeenCalledWith("/v1/platform/service-packages/upsert", {
      selected_workspace_id: "workspace-1",
      package_id: "package-id",
      name: payload.name,
      description: payload.description,
      package_price: payload.package_price,
      discount_type: payload.discount_type,
      discount_value: payload.discount_value,
      is_active: payload.is_active,
      estimated_duration: payload.estimated_duration,
      items,
    });
    expect(typeof mockPost.mock.calls[0][1].items).not.toBe("string");
  });
});
