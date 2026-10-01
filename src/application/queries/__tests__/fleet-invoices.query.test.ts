jest.mock("@/lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

import { apiClient } from "@/lib/api-client";
import { fetchFleetInvoices } from "../fleet-invoices.query";

describe("fetchFleetInvoices", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns authoritative fleet invoice documents for the tenant", async () => {
    const rows = [{ id: "invoice-1", invoice_number: "INV-1", status: "draft" }];
    (apiClient.get as jest.Mock).mockResolvedValue({ data: rows });

    await expect(fetchFleetInvoices("owner-1")).resolves.toEqual(rows);
    expect(apiClient.get).toHaveBeenCalledWith("/v1/fleet/invoices");
  });

  it("propagates database errors instead of presenting an empty invoice list", async () => {
    const error = new Error("permission denied");
    (apiClient.get as jest.Mock).mockRejectedValue(error);

    await expect(fetchFleetInvoices("owner-1")).rejects.toBe(error);
  });

  it("scopes invoice documents to a fleet client when requested", async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });

    await fetchFleetInvoices("owner-1", "client-1");

    expect(apiClient.get).toHaveBeenCalledWith("/v1/fleet/invoices?client_id=client-1");
  });
});
