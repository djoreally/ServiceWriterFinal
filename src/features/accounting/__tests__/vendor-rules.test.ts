import { summarizeAccounting, type AccountingClassification } from "../accounting-engine";
import {
  applyVendorClassificationRules,
  DEFAULT_VENDOR_CLASSIFICATION_RULES,
  findVendorClassificationRule,
  normalizeVendorClassificationRules,
  resolveVendorClassificationRules,
} from "../vendor-rules";

type StoredRow = { description_raw: string; amount: number; classification: AccountingClassification };

const describeRow = (row: StoredRow) => row.description_raw;

describe("vendor classification rules", () => {
  test("the first standing default rule is NAPA -> inventory", () => {
    expect(DEFAULT_VENDOR_CLASSIFICATION_RULES).toContainEqual({
      match: "NAPA",
      classification: "inventory",
    });
  });

  test("normalize distinguishes unconfigured from configured", () => {
    expect(normalizeVendorClassificationRules(null)).toBeNull();
    expect(normalizeVendorClassificationRules(undefined)).toBeNull();
    expect(normalizeVendorClassificationRules("junk")).toBeNull();
    expect(normalizeVendorClassificationRules([])).toEqual([]);
    expect(
      normalizeVendorClassificationRules([
        { match: "napa", classification: "inventory" },
        { match: "", classification: "inventory" },
        { match: "SHELL", classification: "not_a_classification" },
        { nope: true },
      ]),
    ).toEqual([{ match: "napa", classification: "inventory" }]);
  });

  test("resolve falls back to defaults only when unconfigured", () => {
    expect(resolveVendorClassificationRules(null)).toBe(DEFAULT_VENDOR_CLASSIFICATION_RULES);
    expect(resolveVendorClassificationRules(undefined)).toBe(DEFAULT_VENDOR_CLASSIFICATION_RULES);
    expect(resolveVendorClassificationRules([])).toEqual([]);
    const custom = [{ match: "WAWA", classification: "transport" as const }];
    expect(resolveVendorClassificationRules(custom)).toBe(custom);
  });

  test("matching is a case-insensitive substring, first rule wins", () => {
    const rules = resolveVendorClassificationRules(null);
    expect(findVendorClassificationRule("NAPA STORE 8021692 AMBLER PA", rules)?.classification).toBe("inventory");
    expect(findVendorClassificationRule("pos debit napa store", rules)?.classification).toBe("inventory");
    expect(findVendorClassificationRule("WALMART SUPERCENTER", rules)).toBeNull();
    const ordered = [
      { match: "AUTO", classification: "transport" as const },
      { match: "AUTOZONE", classification: "parts_tools" as const },
    ];
    expect(findVendorClassificationRule("AUTOZONE #5707", ordered)?.classification).toBe("transport");
  });

  test("apply reclassifies only matching rows and never mutates the input", () => {
    const rows: StoredRow[] = [
      { description_raw: "NAPA STORE 8021692", amount: -42.4, classification: "parts_tools" },
      { description_raw: "THE GENERAL", amount: -300, classification: "insurance" },
    ];
    const applied = applyVendorClassificationRules(rows, describeRow, resolveVendorClassificationRules(null));
    expect(applied[0].classification).toBe("inventory");
    expect(applied[1]).toBe(rows[1]);
    expect(rows[0].classification).toBe("parts_tools");
  });

  test("no-op on production-shaped data: NAPA rows already stored as inventory", () => {
    // Mirrors the owner's imported record after the Nov 2026 ruling:
    // every NAPA row is already classified inventory in storage, so
    // activating the standing rule must change nothing — the Expenses
    // totals equal the Accounting totals exactly.
    const stored: StoredRow[] = [
      { description_raw: "STRIPE TRANSFER", amount: 1300.5, classification: "revenue_card" },
      { description_raw: "NAPA STORE 8021692 AMBLER PA", amount: -42.4, classification: "inventory" },
      { description_raw: "POS DEBIT NAPA STORE 8021692", amount: -84.47, classification: "inventory" },
      { description_raw: "ANTHONY GIANNETTE", amount: -1200, classification: "rent" },
      { description_raw: "WESTLAKE", amount: -481, classification: "vehicle_payment" },
      { description_raw: "WALMART SUPERCENTER", amount: -63.6, classification: "inventory" },
    ];
    const applied = applyVendorClassificationRules(stored, describeRow, resolveVendorClassificationRules(null));
    expect(applied.map((r) => r.classification)).toEqual(stored.map((r) => r.classification));
    expect(summarizeAccounting(applied)).toEqual(summarizeAccounting(stored));
  });

  test("a stored parts_tools NAPA row flips to inventory without moving operating totals", () => {
    // Both classifications are operating expenses, so the warehouse
    // summary is identical before and after; only the grouping shifts.
    const stored: StoredRow[] = [
      { description_raw: "NAPA STORE 8021692 AMBLER PA", amount: -42.4, classification: "parts_tools" },
      { description_raw: "HARBOR FREIGHT", amount: -25, classification: "parts_tools" },
    ];
    const applied = applyVendorClassificationRules(stored, describeRow, resolveVendorClassificationRules(null));
    expect(applied[0].classification).toBe("inventory");
    expect(summarizeAccounting(applied).operatingExpenses).toBe(
      summarizeAccounting(stored).operatingExpenses,
    );
    expect(summarizeAccounting(applied)).toEqual(summarizeAccounting(stored));
  });
});
