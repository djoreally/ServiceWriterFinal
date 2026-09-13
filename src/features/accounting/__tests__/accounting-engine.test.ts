import {
  classifyBankTransaction,
  normalizeBankRows,
  summarizeAccounting,
} from "../accounting-engine";

describe("accounting engine", () => {
  test("separates customer revenue, capital, expenses, and owner draws", () => {
    const rows = [
      { amount: 1000, classification: "revenue_card" as const },
      { amount: 500, classification: "investor_capital" as const },
      { amount: -300, classification: "inventory" as const },
      { amount: -100, classification: "owner_draw" as const },
    ];
    expect(summarizeAccounting(rows)).toEqual({
      revenue: 1000,
      operatingExpenses: 300,
      operatingProfit: 700,
      cashIn: 1500,
      cashOut: 400,
      netCashChange: 1100,
      ownerDraws: 100,
      investorCapital: 500,
      unresolvedAmount: 0,
      unresolvedCount: 0,
    });
  });

  test("does not guess ATM withdrawals", () => {
    expect(classifyBankTransaction("ATM WITHDRAWAL 90 W BUTLER", -100).classification).toBe("unresolved");
  });

  test("recognizes Chase-style rows", () => {
    const rows = normalizeBankRows([
      { "Posting Date": "09/13/2026", Description: "MOMS MOBILE OIL CHANGE STRIPE", Amount: "200.00" },
      { "Posting Date": "09/13/2026", Description: "THE GENERAL", Amount: "-300.00" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].classification).toBe("revenue_card");
    expect(rows[1].classification).toBe("insurance");
  });
});
