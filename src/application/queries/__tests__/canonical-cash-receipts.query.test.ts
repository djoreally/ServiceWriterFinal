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

import { apiClient } from "@/lib/api-client";
import { fetchCanonicalCashReceipts } from "@/application/queries/canonical-cash-receipts.query";

// The manual-payment flow settles a cash closeout with TWO succeeded
// payment rows: the cash actually received, plus a waiver row for the
// difference the shop ate (metadata.source = "manual_adjustment",
// provider NULL). Collected means succeeded payments that are NOT
// adjustments, so the canonical receipts set must never contain the
// waiver — every collected figure (dashboard today/week/month/YTD,
// provider snapshot, reports) sums this one set.
describe("fetchCanonicalCashReceipts adjustment exclusion", () => {
  const mockGet = apiClient.get as jest.Mock;

  beforeEach(() => {
    mockGet.mockReset();
  });

  // Angela Tuckowski's INV-569 closeout shape: $110.23 cash in hand,
  // $10.84 waived. The dashboard once showed "$121.07 collected".
  const cashRow = {
    id: "pay-cash",
    amount: 110.23,
    status: "succeeded",
    provider: "other",
    paid_at: "2026-11-09T19:31:00.000Z",
    created_at: "2026-11-09T19:31:00.000Z",
    metadata: {
      payment_method: "cash",
      recorded_manually: true,
      received_in_person: true,
      cash_closeout: { waived_amount: 10.84, waive_reason: "cash_discount_fee_waive" },
    },
  };
  const waiveRow = {
    id: "pay-waive",
    amount: 10.84,
    status: "succeeded",
    provider: null,
    paid_at: "2026-11-09T19:31:00.000Z",
    created_at: "2026-11-09T19:31:00.000Z",
    metadata: {
      source: "manual_adjustment",
      adjustment_type: "cash_discount_fee_waive",
      related_payment_id: "pay-cash",
      notes: null,
    },
  };

  it("excludes the manual_adjustment waiver row and keeps the cash row", async () => {
    mockGet.mockResolvedValue({ data: [cashRow, waiveRow] });

    const { data, error } = await fetchCanonicalCashReceipts({
      workspaceId: "workspace-1",
      from: "2026-01-01T05:00:00.000Z",
    });

    expect(error).toBeNull();
    expect(data.map((receipt) => receipt.payment_record_id)).toEqual(["pay-cash"]);
    expect(data[0].net_collected_cents).toBe(11023);
    const collected = data.reduce((sum, receipt) => sum + receipt.net_collected_cents, 0);
    expect(collected).toBe(11023);
  });

  it("keeps rows with no metadata at all (null-tolerant)", async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: "pay-nometa",
          amount: 50,
          status: "succeeded",
          provider: "stripe",
          paid_at: "2026-11-09T15:00:00.000Z",
          created_at: "2026-11-09T15:00:00.000Z",
          metadata: null,
        },
      ],
    });

    const { data, error } = await fetchCanonicalCashReceipts({
      workspaceId: "workspace-1",
      from: "2026-01-01T05:00:00.000Z",
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].net_collected_cents).toBe(5000);
  });

  it("keeps rows whose metadata has no source key", async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: "pay-nosource",
          amount: 25.5,
          status: "succeeded",
          provider: "stripe",
          paid_at: "2026-11-09T15:00:00.000Z",
          created_at: "2026-11-09T15:00:00.000Z",
          metadata: { payment_type: "card" },
        },
      ],
    });

    const { data, error } = await fetchCanonicalCashReceipts({
      workspaceId: "workspace-1",
      from: "2026-01-01T05:00:00.000Z",
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].net_collected_cents).toBe(2550);
  });

  it("keeps rows with other source values — only manual_adjustment is excluded", async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: "pay-synced",
          amount: 75,
          status: "succeeded",
          provider: "stripe",
          paid_at: "2026-11-09T15:00:00.000Z",
          created_at: "2026-11-09T15:00:00.000Z",
          metadata: { source: "provider_sync" },
        },
        waiveRow,
      ],
    });

    const { data, error } = await fetchCanonicalCashReceipts({
      workspaceId: "workspace-1",
      from: "2026-01-01T05:00:00.000Z",
    });

    expect(error).toBeNull();
    expect(data.map((receipt) => receipt.payment_record_id)).toEqual(["pay-synced"]);
  });
});
