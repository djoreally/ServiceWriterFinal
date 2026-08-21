jest.mock("@/integrations/supabase/client", () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchFleetInvoices } from "../fleet-invoices.query";

function queryResult(result: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    order: jest.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.order.mockResolvedValue(result);
  (supabase.from as jest.Mock).mockReturnValue(chain);
  return chain;
}

describe("fetchFleetInvoices", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns authoritative fleet invoice documents for the tenant", async () => {
    const rows = [{ id: "invoice-1", invoice_number: "INV-1", status: "draft" }];
    const chain = queryResult({ data: rows, error: null });

    await expect(fetchFleetInvoices("owner-1")).resolves.toEqual(rows);
    expect(supabase.from).toHaveBeenCalledWith("invoices");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "owner-1");
    expect(chain.eq).toHaveBeenCalledWith("bill_to_type", "fleet");
  });

  it("propagates database errors instead of presenting an empty invoice list", async () => {
    const error = new Error("permission denied");
    queryResult({ data: null, error });

    await expect(fetchFleetInvoices("owner-1")).rejects.toBe(error);
  });

  it("scopes invoice documents to a fleet client when requested", async () => {
    const chain = queryResult({ data: [], error: null });

    await fetchFleetInvoices("owner-1", "client-1");

    expect(chain.eq).toHaveBeenCalledWith("fleet_client_id", "client-1");
  });
});
