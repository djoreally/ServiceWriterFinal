/**
 * Tests for the Phase 2 document-intake application layer — verifies that
 * approveAndPromoteIntakeDocument delegates to the documents Hono router
 * and maps the response shapes.
 */
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
import {
  approveAndPromoteIntakeDocument,
  type DocumentIntakeRow,
} from "@/application/queries/document-intake.query";

const mockPost = apiClient.post as jest.Mock;
const mockGet = apiClient.get as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;

const baseDoc = (overrides: Partial<DocumentIntakeRow>): DocumentIntakeRow => ({
  id: "doc-1",
  user_id: "user-1",
  uploaded_by_user_id: "user-1",
  file_path: "user-1/doc-1.pdf",
  file_name: "receipt.pdf",
  mime_type: "application/pdf",
  file_size_bytes: 1024,
  profile: "general",
  parse_status: "parsed",
  parse_method: "text",
  parse_error: null,
  parsed_json: {},
  raw_text: null,
  confidence: 0.9,
  extracted_vin: null,
  vin_valid: null,
  fleet_vehicle_id: null,
  review_status: "pending_review",
  reviewed_at: null,
  reviewed_by: null,
  rejection_reason: null,
  promoted_expense_id: null,
  promoted_work_order_id: null,
  promoted_fuel_log_id: null,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe("approveAndPromoteIntakeDocument", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("posts to the approve endpoint and maps fuel-log ids", async () => {
    mockPost.mockResolvedValue({
      data: { expense_id: null, work_order_id: null, fuel_log_id: "fuel-log-99" },
    });

    const doc = baseDoc({
      profile: "fuel",
      parsed_json: {
        transaction_date: "2026-04-20",
        gallons: 12.5,
        price_per_gallon: 4.29,
        total_amount: 53.62,
        odometer: 102334,
      } as DocumentIntakeRow["parsed_json"],
    });

    const result = await approveAndPromoteIntakeDocument(doc, "user-1");
    expect(result.fuelLogId).toBe("fuel-log-99");
    expect(result.expenseId).toBeUndefined();
    expect(mockPost).toHaveBeenCalledWith("/v1/document-intake/doc-1/approve");
  });

  it("posts to the approve endpoint and maps expense ids", async () => {
    mockPost.mockResolvedValue({
      data: { expense_id: "exp-77", work_order_id: null, fuel_log_id: null },
    });

    const doc = baseDoc({
      profile: "service",
      parsed_json: {
        vendor_name: "Sprinter Specialists",
        transaction_date: "2026-04-15",
        subtotal: 120,
        tax_amount: 8.44,
        total_amount: 128.44,
        vin: "W1Y4ECHY6MT076871",
        mileage: 102334,
        oil_type: "5W30",
        oil_spec: "229.52",
      } as DocumentIntakeRow["parsed_json"],
    });

    const result = await approveAndPromoteIntakeDocument(doc, "user-1");
    expect(result.expenseId).toBe("exp-77");
  });

  it("returns existing IDs without a network call when already approved", async () => {
    const doc = baseDoc({
      review_status: "approved",
      promoted_expense_id: "exp-already",
    });
    const result = await approveAndPromoteIntakeDocument(doc, "user-1");
    expect(result.expenseId).toBe("exp-already");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("throws when there is no parsed data to promote", async () => {
    const doc = baseDoc({ parsed_json: null });
    await expect(approveAndPromoteIntakeDocument(doc, "user-1")).rejects.toThrow(/parse it first/i);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("intake query reads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches intake documents through the list endpoint", async () => {
    const { fetchIntakeDocuments } = await import("@/application/queries/document-intake.query");
    mockGet.mockResolvedValue({ data: [{ id: "doc-1" }] });
    const rows = await fetchIntakeDocuments("user-1", { reviewStatus: "pending_review" });
    expect(rows).toEqual([{ id: "doc-1" }]);
    expect(mockGet).toHaveBeenCalledWith("/v1/document-intake", {
      query: { review_status: "pending_review", profile: undefined },
    });
  });

  it("rejects documents through the patch endpoint", async () => {
    const { rejectIntakeDocument } = await import("@/application/queries/document-intake.query");
    mockPatch.mockResolvedValue({ data: null });
    await rejectIntakeDocument("doc-9", "duplicate");
    expect(mockPatch).toHaveBeenCalledWith("/v1/document-intake/doc-9", {
      review_status: "rejected",
      rejection_reason: "duplicate",
    });
  });
});
