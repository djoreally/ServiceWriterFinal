/**
 * Tests for approveAndPromoteIntakeDocument — verifies that approving a parsed
 * fuel, service, or general expense receipt creates the correct linked records
 * without throwing runtime errors.
 */
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(async () => ({ data: [], error: null })),
    storage: {
      from: jest.fn(() => ({
        createSignedUrl: jest.fn(async () => ({ data: { signedUrl: "https://signed.example/x" }, error: null })),
      })),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  approveAndPromoteIntakeDocument,
  type DocumentIntakeRow,
} from "@/application/queries/document-intake.query";

type Row = Record<string, unknown>;

function makeBuilder(opts: { selectReturn?: { data: Row | null; error: unknown } } = {}) {
  const builder: any = {
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    select: jest.fn(() => builder),
    single: jest.fn(async () => opts.selectReturn ?? { data: { id: "generated-id" }, error: null }),
    then: (resolve: (v: { data: null; error: null }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return builder;
}

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
  const mockFrom = supabase.from as jest.Mock;
  const mockRpc = supabase.rpc as jest.Mock;

  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it("creates a fuel log for fuel-profile documents", async () => {
    const fuelInsertBuilder = makeBuilder({ selectReturn: { data: { id: "fuel-log-99" }, error: null } });
    const docUpdateBuilder = makeBuilder();

    mockFrom.mockImplementation((table: string) => {
      if (table === "fleet_fuel_logs") return fuelInsertBuilder;
      if (table === "document_intake") return docUpdateBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const doc = baseDoc({
      profile: "fuel",
      parsed_json: {
        transaction_date: "2026-04-20",
        gallons: 12.5,
        price_per_gallon: 4.29,
        total_amount: 53.62,
        odometer: 102334,
      } as any,
    });

    const result = await approveAndPromoteIntakeDocument(doc, "user-1");
    expect(result.fuelLogId).toBe("fuel-log-99");
    expect(result.expenseId).toBeUndefined();
    expect(fuelInsertBuilder.insert).toHaveBeenCalledTimes(1);
    expect(docUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ review_status: "approved", promoted_fuel_log_id: "fuel-log-99" }),
    );
  });

  it("creates an expense (with VIN/mileage notes) for service documents", async () => {
    const expenseBuilder = makeBuilder({ selectReturn: { data: { id: "exp-77" }, error: null } });
    const docUpdateBuilder = makeBuilder();

    mockFrom.mockImplementation((table: string) => {
      if (table === "expenses") return expenseBuilder;
      if (table === "document_intake") return docUpdateBuilder;
      throw new Error(`Unexpected table: ${table}`);
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
      } as any,
    });

    const result = await approveAndPromoteIntakeDocument(doc, "user-1");
    expect(result.expenseId).toBe("exp-77");
    const insertedExpense = expenseBuilder.insert.mock.calls[0][0][0];
    expect(insertedExpense.vendor_name_raw).toBe("Sprinter Specialists");
    expect(insertedExpense.total_amount).toBe(128.44);
    expect(insertedExpense.notes).toContain("VIN: W1Y4ECHY6MT076871");
    expect(insertedExpense.notes).toContain("229.52");
  });

  it("creates a plain expense for general receipts (no line items insert when empty)", async () => {
    const expenseBuilder = makeBuilder({ selectReturn: { data: { id: "exp-1" }, error: null } });
    const docUpdateBuilder = makeBuilder();
    const lineItemBuilder = makeBuilder();

    mockFrom.mockImplementation((table: string) => {
      if (table === "expenses") return expenseBuilder;
      if (table === "expense_line_items") return lineItemBuilder;
      if (table === "document_intake") return docUpdateBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const doc = baseDoc({
      profile: "general",
      parsed_json: {
        vendor_name: "Office Depot",
        transaction_date: "2026-04-18",
        subtotal: 25,
        tax_amount: 2,
        total_amount: 27,
      } as any,
    });

    const result = await approveAndPromoteIntakeDocument(doc, "user-1");
    expect(result.expenseId).toBe("exp-1");
    expect(lineItemBuilder.insert).not.toHaveBeenCalled();
  });

  it("returns existing IDs without re-inserting when already approved", async () => {
    const doc = baseDoc({
      review_status: "approved",
      promoted_expense_id: "exp-already",
    });
    const result = await approveAndPromoteIntakeDocument(doc, "user-1");
    expect(result.expenseId).toBe("exp-already");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("throws when there is no parsed data to promote", async () => {
    const doc = baseDoc({ parsed_json: null });
    await expect(approveAndPromoteIntakeDocument(doc, "user-1")).rejects.toThrow(/parse it first/i);
  });
});
