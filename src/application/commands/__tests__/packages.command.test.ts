jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
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

describe("service package commands", () => {
  const mockRpc = supabase.rpc as jest.Mock;

  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("creates packages with JSONB item arrays instead of stringified JSON", async () => {
    mockRpc.mockResolvedValue({ data: "package-id", error: null });

    await expect(createServicePackage(payload, items)).resolves.toBe("package-id");

    expect(mockRpc).toHaveBeenCalledWith("upsert_service_package", {
      p_name: payload.name,
      p_description: payload.description,
      p_package_price: payload.package_price,
      p_discount_type: payload.discount_type,
      p_discount_value: payload.discount_value,
      p_is_active: payload.is_active,
      p_estimated_duration: payload.estimated_duration,
      p_items: items,
    });
    expect(typeof mockRpc.mock.calls[0][1].p_items).not.toBe("string");
  });

  it("updates packages with JSONB item arrays instead of stringified JSON", async () => {
    mockRpc.mockResolvedValue({ data: "package-id", error: null });

    await expect(updateServicePackage("package-id", payload, items)).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith("upsert_service_package", {
      p_package_id: "package-id",
      p_name: payload.name,
      p_description: payload.description,
      p_package_price: payload.package_price,
      p_discount_type: payload.discount_type,
      p_discount_value: payload.discount_value,
      p_is_active: payload.is_active,
      p_estimated_duration: payload.estimated_duration,
      p_items: items,
    });
    expect(typeof mockRpc.mock.calls[0][1].p_items).not.toBe("string");
  });
});
