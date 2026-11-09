import {
  accountingClassificationLabel,
  classifyBankTransaction,
  isAccountingOperatingExpense,
  isAccountingRevenue,
  isBankExpenseClassification,
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

  test("revenue and operating-expense predicates match the summary sets", () => {
    expect(isAccountingRevenue("revenue_card")).toBe(true);
    expect(isAccountingRevenue("revenue_fleet")).toBe(true);
    expect(isAccountingRevenue("merchant_refund")).toBe(false);
    expect(isAccountingRevenue("investor_capital")).toBe(false);
    expect(isAccountingOperatingExpense("inventory")).toBe(true);
    expect(isAccountingOperatingExpense("rent")).toBe(true);
    expect(isAccountingOperatingExpense("bank_fee")).toBe(true);
    expect(isAccountingOperatingExpense("owner_draw")).toBe(false);
    expect(isAccountingOperatingExpense("asset_purchase")).toBe(false);
    expect(isAccountingOperatingExpense("transfer")).toBe(false);
  });

  test("bank expense view shows spending classifications only", () => {
    // Operating expenses plus asset purchases, owner draws and
    // still-unresolved outflows read as spending in the expense ledger.
    expect(isBankExpenseClassification("inventory")).toBe(true);
    expect(isBankExpenseClassification("parts_tools")).toBe(true);
    expect(isBankExpenseClassification("rent")).toBe(true);
    expect(isBankExpenseClassification("asset_purchase")).toBe(true);
    expect(isBankExpenseClassification("owner_draw")).toBe(true);
    expect(isBankExpenseClassification("unresolved")).toBe(true);
    // Revenue, refunds, capital and internal transfers are not spending.
    expect(isBankExpenseClassification("revenue_card")).toBe(false);
    expect(isBankExpenseClassification("merchant_refund")).toBe(false);
    expect(isBankExpenseClassification("investor_capital")).toBe(false);
    expect(isBankExpenseClassification("transfer")).toBe(false);
  });

  test("classification labels are human readable", () => {
    expect(accountingClassificationLabel("parts_tools")).toBe("Parts Tools");
    expect(accountingClassificationLabel("vehicle_payment")).toBe("Vehicle Payment");
    expect(accountingClassificationLabel("inventory")).toBe("Inventory");
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
