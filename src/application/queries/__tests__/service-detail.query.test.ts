/**
 * CHAIR-3 outcome contract for fetchServiceDetail (Item #9 Step 2).
 *
 * The detail page must distinguish "the record does not exist" (endpoint
 * answered `{ data: null }` → bounce with a not-found toast) from "the
 * record could not be loaded" (HTTP/network/session failure → stay with
 * a distinct error state). Before this contract, every failure was
 * swallowed into null and read as "Service not found" — which is how a
 * broken server read hid behind a not-found toast for records that
 * exist.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentAuthUser: jest.fn(),
}));

jest.mock("@/application/queries/settings.query", () => ({
  resolveCurrentWorkspace: jest.fn(async () => ({ workspaceId: "workspace-1", userId: "user-1" })),
}));

import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { fetchServiceDetail } from "@/application/queries/service-detail.query";

const mockGet = apiClient.get as jest.Mock;
const mockGetUser = getCurrentAuthUser as jest.Mock;

const SERVICE_ID = "aa0e8400-e29b-41d4-a716-446655440001";

function bundleFixture() {
  return {
    service: {
      id: SERVICE_ID,
      customer_id: null,
      vehicle_id: null,
      appointment_id: null,
      status: "completed",
      work_performed: "Full synthetic oil change",
      customer_notes: null,
      internal_notes: null,
      oil_quarts_used: 5,
      metadata: {},
      created_at: "2026-11-10T16:42:01Z",
      updated_at: "2026-11-10T16:42:01Z",
      started_at: null,
      completed_at: "2026-11-10T16:42:01Z",
    },
    customer: null,
    vehicle: null,
    line_items: [],
    workspace_email: "shop@example.com",
    workspace_name: "MOMS Mobile Oil Change",
    appointment: null,
    fallback_customer: null,
    vehicle_specs: null,
    first_appointment_item: {
      service_catalog_id: "aa0e8400-e29b-41d4-a716-446655440004",
      description: "Full Synthetic Oil Change",
      quantity: 1,
      unit_price: 119,
      service_catalog: {
        name: "Full Synthetic Oil Change",
        description: "Full synthetic oil and filter",
        estimated_duration: 90,
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("fetchServiceDetail outcomes", () => {
  it("ok: returns the mapped detail, with catalog minutes converted to labor hours", async () => {
    mockGet.mockResolvedValue({ data: bundleFixture() });
    const outcome = await fetchServiceDetail(SERVICE_ID);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") throw new Error("expected ok outcome");
    expect(outcome.detail.service.id).toBe(SERVICE_ID);
    expect(outcome.detail.catalogLaborHours).toBe(1.5);
    expect(outcome.detail.catalogDescription).toBe("Full synthetic oil and filter");
    expect(outcome.detail.businessName).toBe("MOMS Mobile Oil Change");
  });

  it("not_found: the endpoint's { data: null } answer stays a not-found outcome", async () => {
    mockGet.mockResolvedValue({ data: null });
    const outcome = await fetchServiceDetail(SERVICE_ID);
    expect(outcome).toEqual({ status: "not_found" });
  });

  it("error: an HTTP failure is a load error with the failure's message, not a not-found", async () => {
    mockGet.mockRejectedValue(new Error("column service_catalog.estimated_duration does not exist"));
    const outcome = await fetchServiceDetail(SERVICE_ID);
    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") throw new Error("expected error outcome");
    expect(outcome.message).toContain("estimated_duration");
  });

  it("error: no signed-in user is a load error, and the endpoint is never called", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const outcome = await fetchServiceDetail(SERVICE_ID);
    expect(outcome.status).toBe("error");
    expect(mockGet).not.toHaveBeenCalled();
  });
});
