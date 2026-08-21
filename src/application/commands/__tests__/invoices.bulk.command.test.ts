jest.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));
jest.mock("@/application/queries/invoices.query", () => ({
  generateInvoiceNumber: jest.fn(),
}));

import { supabase } from "@/integrations/supabase/client";
import { createInvoiceFromFleetWorkOrders, isMissingFleetInvoiceRpc } from "@/application/commands/invoices.command";

describe("createInvoiceFromFleetWorkOrders", () => {
  /** Preflight reads contract + PO linkage before the atomic RPC. */
  function mockPreflight(ids: string[]) {
    (supabase.from as jest.Mock).mockReturnValue({
      select: () => ({
        in: async () => ({
          data: ids.map((id) => ({
            id,
            fleet_contract_id: `contract-${id}`,
            fleet_purchase_order_id: `po-${id}`,
            po_number: `PO-${id}`,
          })),
          error: null,
        }),
      }),
    });
  }

  beforeEach(() => jest.clearAllMocks());

  it("uses the versioned UUID-safe RPC", async () => {
    mockPreflight(["wo-1", "wo-2"]);
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [{ invoice_id: "invoice-1", invoice_number: "INV-1", work_order_count: 2, line_item_count: 3, subtotal: 100, total: 108 }],
      error: null,
    });

    const result = await createInvoiceFromFleetWorkOrders(["wo-1", "wo-2", "wo-1"], {
      taxEnabled: true,
      taxRate: 8,
      processingFeeEnabled: true,
      processingFeeType: "percentage",
      processingFeeValue: 3,
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_fleet_consolidated_invoice_v3",
      {
        _work_order_ids: ["wo-1", "wo-2"],
        _invoice_number: null,
        _notes: null,
        _tax_enabled: true,
        _tax_rate: 8,
        _processing_fee_enabled: true,
        _processing_fee_type: "percentage",
        _processing_fee_value: 3,
      },
    );
    expect(result).toEqual({
      invoice_id: "invoice-1",
      invoice_number: "INV-1",
      work_order_count: 2,
      line_item_count: 3,
      subtotal: 100,
      total: 108,
    });
  });

  it("does not call the mutation when no work orders are selected", async () => {
    await expect(createInvoiceFromFleetWorkOrders([])).rejects.toThrow("Select at least one completed work order");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("surfaces an atomic RPC failure to the workflow", async () => {
    mockPreflight(["wo-1", "wo-2"]);
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "One or more work orders is already linked to an invoice" },
    });

    await expect(createInvoiceFromFleetWorkOrders(["wo-1", "wo-2"])).rejects.toThrow(
      "One or more work orders is already linked to an invoice",
    );
  });
});

describe("isMissingFleetInvoiceRpc", () => {
  it("recognizes PostgREST schema-cache misses", () => {
    expect(isMissingFleetInvoiceRpc({ code: "PGRST202" })).toBe(true);
    expect(isMissingFleetInvoiceRpc({ message: "Could not find the function public.create_fleet_consolidated_invoice(...) in the schema cache" })).toBe(true);
    expect(isMissingFleetInvoiceRpc({ code: "42501", message: "Not authorized" })).toBe(false);
  });
});
