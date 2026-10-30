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
  resolveCurrentWorkspace: jest.fn(async () => ({ workspaceId: "workspace-1", userId: "user-1" })),
}));

import { apiClient } from "@/lib/api-client";
import { fetchDashboardReporting } from "@/application/queries/dashboard.query";

// fetchDashboardReporting pulls raw rows from
// GET /v1/platform/dashboard/reporting and applies the reporting mapping
// (including the cancelled-appointment exclusion) client-side. These
// tests feed rows through the API client mock.
describe("fetchDashboardReporting financial reporting mapping", () => {
  const mockGet = apiClient.get as jest.Mock;

  beforeEach(() => {
    mockGet.mockReset();
  });

  it("excludes pending payments for cancelled appointments from reporting totals", async () => {
    mockGet.mockResolvedValue({
      paymentRows: [
        {
          id: "p1",
          amount: 5000,
          created_at: "2026-03-01T10:00:00Z",
          status: "pending",
          metadata: {
            customer_email: "a@example.com",
            customer_name: "A",
            appointment_status: "cancelled",
          },
          customers: null,
        },
        {
          id: "p2",
          amount: 7000,
          created_at: "2026-03-01T11:00:00Z",
          status: "pending",
          metadata: {
            customer_email: "b@example.com",
            customer_name: "B",
            appointment_status: "confirmed",
          },
          customers: null,
        },
        {
          id: "p3",
          amount: 9000,
          created_at: "2026-03-01T12:00:00Z",
          status: "succeeded",
          metadata: {
            refunded_amount: 300,
            appointment_status: "cancelled",
          },
          customers: null,
        },
      ],
      serviceRows: [],
      appointmentRows: [],
      prevPaymentRows: [{ id: "prev-1", amount: 1000, status: "succeeded", metadata: null }],
    });

    const result = await fetchDashboardReporting({
      from: new Date("2026-03-01T00:00:00Z"),
      to: new Date("2026-03-31T23:59:59Z"),
    });

    expect(mockGet).toHaveBeenCalledWith(
      "/v1/platform/dashboard/reporting",
      expect.objectContaining({
        query: expect.objectContaining({ selected_workspace_id: "workspace-1" }),
      }),
    );

    expect(result.payments).toEqual([
      {
        id: "p2",
        amount: 7000,
        created_at: "2026-03-01T11:00:00Z",
        status: "pending",
        customer_email: "b@example.com",
        customer_name: "B",
        refund_amount: undefined,
      },
      {
        id: "p3",
        amount: 9000,
        created_at: "2026-03-01T12:00:00Z",
        status: "succeeded",
        customer_email: undefined,
        customer_name: undefined,
        refund_amount: 300,
      },
    ]);

    expect(result.previousPeriodPayments).toEqual([{ id: "prev-1", amount: 1000, status: "succeeded" }]);
  });
});
