import { jest } from "@jest/globals";

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

import { apiClient } from "@/lib/api-client";
import { getJobRuntime } from "@/application/queries/get-job-runtime.query";

const get = apiClient.get as jest.Mock;

describe("getJobRuntime", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("builds canonical runtime from appointment + ledger", async () => {
    get.mockResolvedValue({
      data: {
        appointment: {
          id: "job-1",
          user_id: "org-1",
          workspace_id: "org-1",
          customer_id: "cust-1",
          vehicle_id: "veh-1",
          service_catalog_id: "svc-1",
          title: "Oil Change",
          status: "scheduled",
          dispatch_status: "en_route",
          assigned_technician_id: "tech-1",
          estimated_cost: 120,
          tax_amount: 10,
          metadata: { estimated_cost: 120, tax_amount: 10 },
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T01:00:00Z",
          customer: { id: "cust-1", name: "Jane", phone: "555", email: "j@example.com" },
          vehicle: { id: "veh-1", make: "Honda", model: "Civic", year: 2020, vin: "VIN123" },
        },
        items: [{ quantity: 1, unit_price: 120 }],
        service: null,
        invoice: null,
        payments: [{ amount: 50, refund_amount: 0, status: "succeeded" }],
        checklist: [],
      },
    });

    const runtime = await getJobRuntime("job-1", {
      userId: "org-1",
      orgId: "org-1",
      role: "owner",
      permissions: ["jobs.read", "jobs.write", "jobs.transition", "financials.read"],
    });

    expect(get).toHaveBeenCalledWith("/v1/jobs/job-1/runtime");
    expect(runtime.id).toBe("job-1");
    expect(runtime.lifecycle.status).toBe("scheduled");
    expect(runtime.financials.totalCents).toBe(13000);
    expect(runtime.financials.paidCents).toBe(5000);
    expect(runtime.financials.balanceCents).toBe(8000);
    expect(runtime.trust.visibleToUser).toBe(true);
  });
});
