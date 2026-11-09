import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from "date-fns";
import {
  accountingClassificationLabel,
  isAccountingOperatingExpense,
  isAccountingRevenue,
  summarizeAccounting,
  type AccountingClassification,
  type AccountingSummary,
} from "./accounting-engine";

export type DrawSide = "owner" | "partner";

export interface StatementBankRow {
  amount: number;
  classification: AccountingClassification;
  posted_on: string;
  draw_side?: DrawSide | null;
  source_data?: Record<string, unknown> | null;
}

export interface StatementReceivable {
  id: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: string;
  dueDate: string | null;
  balance: number;
}

export interface StatementMoneyLine {
  key: string;
  label: string;
  amount: number;
}

export interface ExpenseBreakdownLine extends StatementMoneyLine {
  percentage: number;
}

export type AgingBucketKey = "current" | "days1To30" | "days31To60" | "days61To90" | "over90";

export interface AgingInvoice extends StatementReceivable {
  daysPastDue: number;
  bucketKey: AgingBucketKey;
}

export interface AgingBucket {
  key: AgingBucketKey;
  label: string;
  rows: AgingInvoice[];
  total: number;
}

export interface DrawSplit {
  owner: number;
  partner: number;
  unassigned: number;
  total: number;
}

export interface FinancialStatementsData {
  rangeLabel: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  asOfLabel: string;
  summary: AccountingSummary;
  revenueLines: StatementMoneyLine[];
  expenseLines: StatementMoneyLine[];
  drawSplit: DrawSplit;
  resultAfterCapitalAndDraws: number;
  cashFlow: {
    operating: number;
    financing: number;
    other: number;
    netCashChange: number;
  };
  expenseBreakdown: {
    lines: ExpenseBreakdownLine[];
    total: number;
  };
  receivables: {
    buckets: AgingBucket[];
    total: number;
    count: number;
  };
  balanceSheet: {
    accountsReceivable: number;
    investorCapitalOwed: number;
    knownAssetsExcludingCash: number;
    knownLiabilitiesExcludingVehicleLoan: number;
    knownEquityBeforeOpeningEquity: number;
  };
}

const REVENUE_ORDER: AccountingClassification[] = [
  "revenue_card",
  "revenue_fleet",
  "revenue_cash",
  "revenue_other",
];

const REVENUE_LABELS: Partial<Record<AccountingClassification, string>> = {
  revenue_card: "Card payments from customers",
  revenue_fleet: "Fleet and check payments",
  revenue_cash: "Cash deposits",
  revenue_other: "Other customer revenue",
};

const EXPENSE_ORDER: AccountingClassification[] = [
  "rent",
  "inventory",
  "parts_tools",
  "vehicle_payment",
  "insurance",
  "marketing",
  "transport",
  "phone",
  "bank_fee",
  "merchant_refund",
];

const EXPENSE_LABELS: Partial<Record<AccountingClassification, string>> = {
  rent: "Rent",
  inventory: "Inventory and oil stock",
  parts_tools: "Parts and tools",
  vehicle_payment: "Vehicle payment",
  insurance: "Insurance",
  marketing: "Marketing",
  transport: "Transport and charging",
  phone: "Phone",
  bank_fee: "Bank fees",
  merchant_refund: "Less: merchant refunds",
};

const AGING_BUCKETS: Array<{ key: AgingBucketKey; label: string }> = [
  { key: "current", label: "Current" },
  { key: "days1To30", label: "1–30 days past due" },
  { key: "days31To60", label: "31–60 days past due" },
  { key: "days61To90", label: "61–90 days past due" },
  { key: "over90", label: "90+ days past due" },
];

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDateLabel(value: string | null): string | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "MMM d, yyyy") : value;
}

export function resolveDrawSide(row: StatementBankRow): DrawSide | null {
  if (row.draw_side === "owner" || row.draw_side === "partner") return row.draw_side;
  const sourceSide = row.source_data?.draw_side;
  return sourceSide === "owner" || sourceSide === "partner" ? sourceSide : null;
}

function buildDrawSplit(rows: StatementBankRow[], totalDraws: number): DrawSplit {
  let owner = 0;
  let partner = 0;
  let unassigned = 0;

  for (const row of rows) {
    if (row.classification !== "owner_draw" || Number(row.amount) >= 0) continue;
    const amount = Math.abs(Number(row.amount));
    const side = resolveDrawSide(row);
    if (side === "owner") owner += amount;
    else if (side === "partner") partner += amount;
    else unassigned += amount;
  }

  return {
    owner: round(owner),
    partner: round(partner),
    unassigned: round(unassigned),
    total: round(totalDraws),
  };
}

function revenueLine(classification: AccountingClassification, rows: StatementBankRow[]): StatementMoneyLine {
  const amount = rows.reduce((sum, row) => (
    row.classification === classification && isAccountingRevenue(row.classification) && Number(row.amount) > 0
      ? sum + Number(row.amount)
      : sum
  ), 0);
  return {
    key: classification,
    label: REVENUE_LABELS[classification] ?? accountingClassificationLabel(classification),
    amount: round(amount),
  };
}

function expenseLine(classification: AccountingClassification, rows: StatementBankRow[]): StatementMoneyLine {
  const amount = rows.reduce((sum, row) => {
    const value = Number(row.amount);
    if (classification === "merchant_refund") {
      return row.classification === classification && value > 0 ? sum - value : sum;
    }
    return row.classification === classification && isAccountingOperatingExpense(row.classification) && value < 0
      ? sum + Math.abs(value)
      : sum;
  }, 0);
  return {
    key: classification,
    label: EXPENSE_LABELS[classification] ?? accountingClassificationLabel(classification),
    amount: round(amount),
  };
}

function bucketForDays(daysPastDue: number): AgingBucketKey {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "days1To30";
  if (daysPastDue <= 60) return "days31To60";
  if (daysPastDue <= 90) return "days61To90";
  return "over90";
}

function buildReceivables(rows: StatementReceivable[], asOfDate: Date) {
  const asOf = startOfDay(asOfDate);
  const byBucket = new Map<AgingBucketKey, AgingInvoice[]>();

  for (const row of rows) {
    const due = row.dueDate ? parseISO(row.dueDate) : null;
    const daysPastDue = due && isValid(due) ? Math.max(differenceInCalendarDays(asOf, due), 0) : 0;
    const bucketKey = bucketForDays(daysPastDue);
    const list = byBucket.get(bucketKey) ?? [];
    list.push({ ...row, balance: round(Number(row.balance)), daysPastDue, bucketKey });
    byBucket.set(bucketKey, list);
  }

  const buckets = AGING_BUCKETS.map(({ key, label }) => {
    const bucketRows = [...(byBucket.get(key) ?? [])].sort((a, b) => {
      const aDate = a.dueDate ?? a.issueDate;
      const bDate = b.dueDate ?? b.issueDate;
      return aDate.localeCompare(bDate) || a.invoiceNumber.localeCompare(b.invoiceNumber);
    });
    return {
      key,
      label,
      rows: bucketRows,
      total: round(bucketRows.reduce((sum, row) => sum + row.balance, 0)),
    };
  });

  return {
    buckets,
    total: round(buckets.reduce((sum, bucket) => sum + bucket.total, 0)),
    count: rows.length,
  };
}

/**
 * Build all five advisor-facing statements from the warehouse reads.
 *
 * Bank totals intentionally come from summarizeAccounting(), the same
 * engine Accounting and Overview use. Classification lines use that
 * engine's revenue and operating-expense predicates, including its
 * treatment of merchant refunds as a reduction of operating expenses.
 * Receivables are supplied after the caller applies the shared owed
 * invoice definition and balance helper, so this builder only buckets
 * and totals the exact rows that definition selected.
 */
export function buildFinancialStatements(
  bankRows: StatementBankRow[],
  receivables: StatementReceivable[],
  asOfDate = new Date(),
): FinancialStatementsData {
  const summary = summarizeAccounting(
    bankRows.map((row) => ({ amount: Number(row.amount), classification: row.classification })),
  );

  const postedDates = bankRows.map((row) => row.posted_on).filter(Boolean).sort();
  const rangeStart = postedDates[0] ?? null;
  const rangeEnd = postedDates[postedDates.length - 1] ?? null;
  const rangeStartLabel = formatDateLabel(rangeStart);
  const rangeEndLabel = formatDateLabel(rangeEnd);
  const rangeLabel = rangeStartLabel && rangeEndLabel
    ? `${rangeStartLabel} – ${rangeEndLabel}`
    : "No bank records imported";

  const revenueLines = REVENUE_ORDER
    .map((classification) => revenueLine(classification, bankRows))
    .filter((line) => line.amount !== 0);
  const expenseLines = EXPENSE_ORDER
    .map((classification) => expenseLine(classification, bankRows))
    .filter((line) => line.amount !== 0);

  const drawSplit = buildDrawSplit(bankRows, summary.ownerDraws);
  const financing = round(summary.investorCapital - summary.ownerDraws);
  const otherCashChange = round(summary.netCashChange - summary.operatingProfit - financing);
  const expenseBreakdownLines = [...expenseLines]
    .sort((a, b) => b.amount - a.amount)
    .map((line) => ({
      ...line,
      percentage: summary.operatingExpenses !== 0
        ? round((line.amount / summary.operatingExpenses) * 100)
        : 0,
    }));

  const agedReceivables = buildReceivables(receivables, asOfDate);

  return {
    rangeLabel,
    rangeStart,
    rangeEnd,
    asOfLabel: format(asOfDate, "MMM d, yyyy"),
    summary,
    revenueLines,
    expenseLines,
    drawSplit,
    resultAfterCapitalAndDraws: round(
      summary.operatingProfit + summary.investorCapital - summary.ownerDraws,
    ),
    cashFlow: {
      operating: summary.operatingProfit,
      financing,
      other: otherCashChange,
      netCashChange: summary.netCashChange,
    },
    expenseBreakdown: {
      lines: expenseBreakdownLines,
      total: summary.operatingExpenses,
    },
    receivables: agedReceivables,
    balanceSheet: {
      accountsReceivable: agedReceivables.total,
      investorCapitalOwed: summary.investorCapital,
      knownAssetsExcludingCash: agedReceivables.total,
      knownLiabilitiesExcludingVehicleLoan: summary.investorCapital,
      knownEquityBeforeOpeningEquity: round(summary.operatingProfit - summary.ownerDraws),
    },
  };
}
