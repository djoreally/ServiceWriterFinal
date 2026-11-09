import { buildFinancialStatements, type StatementBankRow, type StatementReceivable } from "../statements";

const bankRow = (
  amount: number,
  classification: StatementBankRow["classification"],
  posted_on = "2026-10-15",
  draw_side: StatementBankRow["draw_side"] = null,
): StatementBankRow => ({ amount, classification, posted_on, draw_side });

const receivable = (
  id: string,
  dueDate: string | null,
  balance: number,
): StatementReceivable => ({
  id,
  invoiceNumber: `INV-${id}`,
  customerName: `Customer ${id}`,
  issueDate: "2026-07-01",
  dueDate,
  balance,
});

describe("financial statements builder", () => {
  const statements = buildFinancialStatements(
    [
      bankRow(1000, "revenue_card", "2026-04-17"),
      bankRow(200, "revenue_cash", "2026-05-01"),
      bankRow(-300, "rent", "2026-06-01"),
      bankRow(-100, "inventory", "2026-06-02"),
      bankRow(25, "merchant_refund", "2026-06-03"),
      bankRow(500, "investor_capital", "2026-04-20"),
      bankRow(-100, "owner_draw", "2026-07-01", "owner"),
      bankRow(-50, "owner_draw", "2026-07-02", "partner"),
      bankRow(-25, "owner_draw", "2026-07-03"),
      bankRow(-200, "asset_purchase", "2026-08-01"),
      bankRow(-10, "transfer", "2026-10-27"),
    ],
    [
      receivable("1", "2026-11-10", 100),
      receivable("2", "2026-10-20", 50),
      receivable("3", "2026-09-20", 40),
      receivable("4", "2026-08-20", 30),
      receivable("5", "2026-07-01", 20),
    ],
    new Date(2026, 10, 8),
  );

  test("profit and loss lines tie to the shared accounting summary", () => {
    expect(statements.rangeLabel).toBe("Apr 17, 2026 – Oct 27, 2026");
    expect(statements.revenueLines).toEqual([
      { key: "revenue_card", label: "Card payments from customers", amount: 1000 },
      { key: "revenue_cash", label: "Cash deposits", amount: 200 },
    ]);
    expect(statements.expenseLines.reduce((sum, line) => sum + line.amount, 0)).toBe(375);
    expect(statements.summary).toMatchObject({
      revenue: 1200,
      operatingExpenses: 375,
      operatingProfit: 825,
      investorCapital: 500,
      ownerDraws: 175,
      netCashChange: 940,
    });
    expect(statements.drawSplit).toEqual({ owner: 100, partner: 50, unassigned: 25, total: 175 });
    expect(statements.resultAfterCapitalAndDraws).toBe(1150);
  });

  test("cash flow reconciles operating, financing, and other movements to net cash change", () => {
    expect(statements.cashFlow).toEqual({
      operating: 825,
      financing: 325,
      other: -210,
      netCashChange: 940,
    });
    expect(
      statements.cashFlow.operating + statements.cashFlow.financing + statements.cashFlow.other,
    ).toBe(statements.cashFlow.netCashChange);
  });

  test("expense breakdown uses operating expenses as its denominator", () => {
    expect(statements.expenseBreakdown.total).toBe(375);
    expect(statements.expenseBreakdown.lines).toEqual([
      { key: "rent", label: "Rent", amount: 300, percentage: 80 },
      { key: "inventory", label: "Inventory and oil stock", amount: 100, percentage: 26.67 },
      { key: "merchant_refund", label: "Less: merchant refunds", amount: -25, percentage: -6.67 },
    ]);
  });

  test("receivables are aged by due date and retain the selected owed total", () => {
    expect(statements.receivables.count).toBe(5);
    expect(statements.receivables.total).toBe(240);
    expect(statements.receivables.buckets.map((bucket) => ({
      key: bucket.key,
      total: bucket.total,
      count: bucket.rows.length,
    }))).toEqual([
      { key: "current", total: 100, count: 1 },
      { key: "days1To30", total: 50, count: 1 },
      { key: "days31To60", total: 40, count: 1 },
      { key: "days61To90", total: 30, count: 1 },
      { key: "over90", total: 20, count: 1 },
    ]);
  });

  test("balance sheet exposes computed lines without inventing blank balances", () => {
    expect(statements.balanceSheet).toEqual({
      accountsReceivable: 240,
      investorCapitalOwed: 500,
      knownAssetsExcludingCash: 240,
      knownLiabilitiesExcludingVehicleLoan: 500,
      knownEquityBeforeOpeningEquity: 650,
    });
  });
});
