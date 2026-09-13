export const ACCOUNTING_CLASSIFICATIONS = [
  "revenue_card",
  "revenue_fleet",
  "revenue_cash",
  "revenue_other",
  "merchant_refund",
  "rent",
  "vehicle_payment",
  "insurance",
  "phone",
  "inventory",
  "parts_tools",
  "marketing",
  "transport",
  "owner_draw",
  "investor_capital",
  "asset_purchase",
  "bank_fee",
  "transfer",
  "unresolved",
] as const;

export type AccountingClassification = typeof ACCOUNTING_CLASSIFICATIONS[number];

export type ImportedBankRow = {
  postedOn: string;
  description: string;
  amount: number;
  direction: "inflow" | "outflow";
  classification: AccountingClassification;
  confidence: number;
  sourceRow: Record<string, unknown>;
};

export type AccountingSummary = {
  revenue: number;
  operatingExpenses: number;
  operatingProfit: number;
  cashIn: number;
  cashOut: number;
  netCashChange: number;
  ownerDraws: number;
  investorCapital: number;
  unresolvedAmount: number;
  unresolvedCount: number;
};

const OPERATING_EXPENSES = new Set<AccountingClassification>([
  "rent","vehicle_payment","insurance","phone","inventory","parts_tools",
  "marketing","transport","bank_fee",
]);
const REVENUE = new Set<AccountingClassification>([
  "revenue_card","revenue_fleet","revenue_cash","revenue_other",
]);

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

export function classifyBankTransaction(description: string, amount: number): {
  classification: AccountingClassification;
  confidence: number;
} {
  const d = description.toUpperCase();
  if (amount > 0) {
    if (includesAny(d, ["REVERSAL:", "REFUND"])) return { classification: "merchant_refund", confidence: 0.9 };
    if (includesAny(d, ["STRIPE", "MOMSOILCHANGE", "MOMS MOBILE OIL CHANGE", "VENMO"])) {
      return { classification: "revenue_card", confidence: 0.94 };
    }
    if (includesAny(d, ["CHECK DEPOSIT", "REMOTE ONLINE DEPOSIT"])) {
      return { classification: "revenue_fleet", confidence: 0.82 };
    }
    if (d.includes("ATM CASH DEPOSIT")) return { classification: "revenue_cash", confidence: 0.78 };
    if (d.includes("DEPOSIT")) return { classification: "revenue_other", confidence: 0.55 };
    return { classification: "unresolved", confidence: 0.2 };
  }

  if (includesAny(d, ["ANTHONY GIANNETTE", "LANDLORD"])) return { classification: "rent", confidence: 0.97 };
  if (d.includes("WESTLAKE")) return { classification: "vehicle_payment", confidence: 0.98 };
  if (d.includes("THE GENERAL")) return { classification: "insurance", confidence: 0.98 };
  if (includesAny(d, ["BOOST MOBILE", "T-MOBILE", "TMOBILE", "METRO BY T-MOBILE"])) return { classification: "phone", confidence: 0.92 };
  if (includesAny(d, ["NAPA", "AUTOZONE", "HARBOR FREIGHT", "TIRE CENTER", "FIRESTONE"])) return { classification: "parts_tools", confidence: 0.87 };
  if (includesAny(d, ["WALMART", "WAL-MART", "WM SUPERCENTER"])) return { classification: "inventory", confidence: 0.62 };
  if (includesAny(d, ["MINUTEMAN", "COPIES NOW", "QR.IO", "PRINT"])) return { classification: "marketing", confidence: 0.9 };
  if (includesAny(d, ["CHARGEPOINT", "BLINK", "IONNA", "TOLL", "SEPTA", "LYFT", "PARKING", "WAWA", "SHELL"])) {
    return { classification: "transport", confidence: 0.72 };
  }
  if (includesAny(d, ["MONTHLY SERVICE FEE", "ATM FEE"])) return { classification: "bank_fee", confidence: 0.95 };
  if (includesAny(d, ["WITHDRAWAL", "ATM WITHDRAW"])) return { classification: "unresolved", confidence: 0.15 };
  return { classification: "unresolved", confidence: 0.2 };
}

function normalizeDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}

function pick(row: Record<string, unknown>, candidates: string[]) {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const found = entries.find(([key]) => key.trim().toLowerCase() === candidate.toLowerCase());
    if (found) return found[1];
  }
  return undefined;
}

export function normalizeBankRows(rows: Record<string, unknown>[]): ImportedBankRow[] {
  const normalized: ImportedBankRow[] = [];
  for (const sourceRow of rows) {
    const date = normalizeDate(pick(sourceRow, ["Posting Date", "Date", "Transaction Date", "Posted Date"]));
    const description = String(pick(sourceRow, ["Description", "Details", "Transaction Detail", "Memo", "Name"]) ?? "").trim();
    const rawAmount = pick(sourceRow, ["Amount", "Transaction Amount"]);
    const debit = Number(pick(sourceRow, ["Debit", "Withdrawals", "Money Out"]) ?? 0);
    const credit = Number(pick(sourceRow, ["Credit", "Deposits", "Money In"]) ?? 0);
    let amount = Number(String(rawAmount ?? "").replace(/[$,]/g, ""));
    if (!Number.isFinite(amount)) {
      if (credit) amount = Math.abs(credit);
      else if (debit) amount = -Math.abs(debit);
    }
    if (!date || !description || !Number.isFinite(amount) || amount === 0) continue;
    const guess = classifyBankTransaction(description, amount);
    normalized.push({
      postedOn: date,
      description,
      amount: Math.round(amount * 100) / 100,
      direction: amount > 0 ? "inflow" : "outflow",
      classification: guess.classification,
      confidence: guess.confidence,
      sourceRow,
    });
  }
  return normalized;
}

export function summarizeAccounting(rows: Array<Pick<ImportedBankRow, "amount" | "classification">>): AccountingSummary {
  let revenue = 0;
  let operatingExpenses = 0;
  let cashIn = 0;
  let cashOut = 0;
  let ownerDraws = 0;
  let investorCapital = 0;
  let unresolvedAmount = 0;
  let unresolvedCount = 0;

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    if (amount > 0) cashIn += amount;
    if (amount < 0) cashOut += Math.abs(amount);
    if (REVENUE.has(row.classification) && amount > 0) revenue += amount;
    if (row.classification === "merchant_refund" && amount > 0) operatingExpenses -= amount;
    if (OPERATING_EXPENSES.has(row.classification) && amount < 0) operatingExpenses += Math.abs(amount);
    if (row.classification === "owner_draw" && amount < 0) ownerDraws += Math.abs(amount);
    if (row.classification === "investor_capital" && amount > 0) investorCapital += amount;
    if (row.classification === "unresolved") {
      unresolvedAmount += Math.abs(amount);
      unresolvedCount += 1;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    revenue: round(revenue),
    operatingExpenses: round(operatingExpenses),
    operatingProfit: round(revenue - operatingExpenses),
    cashIn: round(cashIn),
    cashOut: round(cashOut),
    netCashChange: round(cashIn - cashOut),
    ownerDraws: round(ownerDraws),
    investorCapital: round(investorCapital),
    unresolvedAmount: round(unresolvedAmount),
    unresolvedCount,
  };
}

export function stableRowKey(row: Pick<ImportedBankRow, "postedOn" | "description" | "amount">) {
  return [row.postedOn, row.description.trim().toUpperCase(), row.amount.toFixed(2)].join("|");
}
