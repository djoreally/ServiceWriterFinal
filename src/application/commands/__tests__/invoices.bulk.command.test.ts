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
jest.mock("@/application/queries/workspaces.selection", () => ({
  getSelectedWorkspaceId: jest.fn(() => "ws-1"),
}));

import { apiClient } from "@/lib/api-client";
import {
  createInvoiceFromFleetWorkOrders,
  previewFleetConsolidatedInvoice,
  createInvoiceFromFleetWorkOrder,
  isMissingFleetInvoiceRpc,
} from "@/application/commands/invoices.command";

const mockPost = apiClient.post as jest.Mock;
const mockGet = apiClient.get as jest.Mock;

describe("createInvoiceFromFleetWorkOrders", () => {
  beforeEach(() => jest.clearAllMocks());

  it("posts the consolidated invoice to the documents router and maps the result", async () => {
    mockPost.mockResolvedValue({
      data: { invoice_id: "invoice-1", invoice_number: "INV-1", work_order_count: 2, line_item_count: 3, subtotal: 100, total: 108 },
    });

    const result = await createInvoiceFromFleetWorkOrders(["wo-1", "wo-2", "wo-1"], {
      taxEnabled: true,
      taxRate: 8,
      processingFeeEnabled: true,
      processingFeeType: "percentage",
      processingFeeValue: 3,
    });

    expect(mockPost).toHaveBeenCalledWith("/v1/invoices/fleet-consolidated", {
      workspace_id: "ws-1",
      work_order_ids: ["wo-1", "wo-2"],
      tax_enabled: true,
      tax_rate: 8,
      processing_fee_enabled: true,
      processing_fee_type: "percentage",
      processing_fee_value: 3,
    });
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
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("surfaces a server failure to the workflow", async () => {
    mockPost.mockRejectedValue(new Error("One or more work orders is already linked to an invoice"));

    await expect(createInvoiceFromFleetWorkOrders(["wo-1", "wo-2"])).rejects.toThrow(
      "One or more work orders is already linked to an invoice",
    );
  });
});

describe("previewFleetConsolidatedInvoice", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches the preview from the documents router", async () => {
    mockGet.mockResolvedValue({
      data: { work_orders: [{ id: "wo-1" }], preview_total: 200 },
    });

    const result = await previewFleetConsolidatedInvoice(["wo-1", "wo-2"]);
    expect(mockGet).toHaveBeenCalledWith("/v1/invoices/fleet-consolidated-preview", {
      query: { workspace_id: "ws-1", work_order_ids: ["wo-1", "wo-2"] },
    });
    expect(result).toEqual({ work_orders: [{ id: "wo-1" }], preview_total: 200 });
  });
});

describe("createInvoiceFromFleetWorkOrder", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads the work order payload from the server and forwards to createInvoice", async () => {
    mockGet.mockResolvedValue({
      data: {
        invoice_number: "INV-2026-00009",
        bill_to_type: "fleet",
        customer_id: null,
        fleet_client_id: "fleet-1",
        line_items: [{ description: "Oil change", quantity: 1, unit_price: 80 }],
        fee_overrides: {},
      },
    });
    mockPost.mockResolvedValue({ data: { id: "invoice-9" } });

    const result = await createInvoiceFromFleetWorkOrder("wo-1");
    expect(mockGet).toHaveBeenCalledWith("/v1/invoices/from-fleet-work-order/wo-1", {
      query: { workspace_id: "ws-1" },
    });
    expect(mockPost).toHaveBeenCalledWith(
      "/v1/invoices",
      expect.objectContaining({
        workspace_id: "ws-1",
        invoice_number: "INV-2026-00009",
        bill_to_type: "fleet",
        fleet_client_id: "fleet-1",
        line_items: [{ description: "Oil change", quantity: 1, unit_price: 80, display_order: 0 }],
      }),
    );
    expect(result).toEqual("invoice-9");
  });
});

describe("isMissingFleetInvoiceRpc", () => {
  it("recognizes PostgREST schema-cache misses", () => {
    expect(isMissingFleetInvoiceRpc({ code: "PGRST202" })).toBe(true);
    expect(isMissingFleetInvoiceRpc({ message: "Could not find the function public.create_fleet_consolidated_invoice(...) in the schema cache" })).toBe(true);
    expect(isMissingFleetInvoiceRpc({ code: "42501", message: "Not authorized" })).toBe(false);
  });
});
