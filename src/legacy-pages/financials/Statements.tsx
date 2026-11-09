import { useCallback, useEffect, useState, type ReactNode } from "react";
import { format, isValid, parseISO } from "date-fns";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchBankTransactions } from "@/application/queries/accounting.query";
import { getCurrentUserId } from "@/application/queries/financials.query";
import { fetchInvoiceList } from "@/application/queries/invoices.query";
import { invoiceBalance, isOwedInvoice } from "@/components/invoices/invoice-ui";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import {
  buildFinancialStatements,
  type FinancialStatementsData,
  type StatementMoneyLine,
} from "@/features/accounting/statements";

type MoneyFormatter = (amount: number) => string;

function formatDate(value: string | null): string {
  if (!value) return "No due date recorded";
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "MMM d, yyyy") : value;
}

function MoneyLine({
  line,
  money,
  signed = false,
  strong = false,
}: {
  line: StatementMoneyLine;
  money: MoneyFormatter;
  signed?: boolean;
  strong?: boolean;
}) {
  const display = signed && line.amount < 0
    ? `(${money(Math.abs(line.amount))})`
    : money(line.amount);
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className={strong ? "font-semibold" : ""}>{line.label}</span>
      <span className={`tabular-nums ${strong ? "font-bold" : "font-medium"}`}>{display}</span>
    </div>
  );
}

function TotalLine({
  label,
  amount,
  money,
  signed = false,
}: {
  label: string;
  amount: number;
  money: MoneyFormatter;
  signed?: boolean;
}) {
  const display = signed && amount < 0 ? `(${money(Math.abs(amount))})` : money(amount);
  return (
    <div className="flex items-baseline justify-between gap-4 border-t py-3">
      <span className="font-bold">{label}</span>
      <span className="tabular-nums font-black">{display}</span>
    </div>
  );
}

function BlankLine({ label, blank }: { label: string; blank: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span>{label}</span>
      <span className="text-right font-medium text-muted-foreground">{blank}</span>
    </div>
  );
}

function StatementSection({
  id,
  number,
  title,
  description,
  period,
  children,
  printAvoidBreak = true,
}: {
  id: string;
  number: string;
  title: string;
  description: string;
  period: string;
  children: ReactNode;
  printAvoidBreak?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-6 border bg-card p-6 shadow-sm print:shadow-none ${printAvoidBreak ? "rounded-lg print:break-inside-avoid" : "rounded-md"}`}
    >
      <div className="mb-5 flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Statement {number}</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <p className="shrink-0 text-sm font-semibold">{period}</p>
      </div>
      {children}
    </section>
  );
}

function Subheading({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</h4>;
}

export const StatementsTab = () => {
  const { formatCurrency } = useRegionalSettings();
  const [data, setData] = useState<FinancialStatementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const money: MoneyFormatter = useCallback((amount) => formatCurrency(amount), [formatCurrency]);
  const signedMoney = useCallback((amount: number) => (
    amount < 0 ? `(${formatCurrency(Math.abs(amount))})` : formatCurrency(amount)
  ), [formatCurrency]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        setData(null);
        return;
      }

      const [bankRows, invoiceRows] = await Promise.all([
        fetchBankTransactions(),
        fetchInvoiceList(userId),
      ]);

      if (bankRows.length === 0 && invoiceRows.length === 0) {
        setData(null);
        return;
      }

      // The shared Fix-2 owed definition and shared balance helper select
      // the receivable rows. The statement builder only ages and totals
      // those exact rows, so its grand total ties to Overview/Invoices.
      const receivables = invoiceRows.filter(isOwedInvoice).map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        customerName: row.customers?.name
          || row.contact_name
          || row.fleet_clients?.company_name
          || "Customer name not recorded",
        issueDate: row.issue_date,
        dueDate: row.due_date,
        balance: invoiceBalance(row),
      }));

      setData(buildFinancialStatements(bankRows, receivables));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load financial statements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const scrollToStatement = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="font-bold">Statements could not be loaded</h3>
          <p className="mt-1 text-sm text-destructive">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => void load()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <h3 className="font-bold">No statement data yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Import bank records in Accounting or issue an invoice, and the five statements will be generated from that record.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { summary } = data;
  const bankPeriod = `Bank records: ${data.rangeLabel}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between" data-print-hide>
        <div>
          <h2 className="text-2xl font-black tracking-tight">Business Statements</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Five advisor-ready documents generated from the classified bank record and the current invoice book. Nothing here is typed in separately.
          </p>
          <p className="mt-2 text-sm font-semibold">{bankPeriod}</p>
          <p className="text-xs text-muted-foreground">Receivables shown as of {data.asOfLabel}</p>
        </div>
        <Button onClick={() => window.print()} className="gap-2 self-start lg:self-auto">
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" data-print-hide>
        {[
          ["statement-profit-loss", "Profit & Loss"],
          ["statement-cash-flow", "Cash Flow"],
          ["statement-ar-aging", "AR Aging"],
          ["statement-expense-breakdown", "Expense Breakdown"],
          ["statement-balance-sheet", "Balance Sheet"],
        ].map(([id, label]) => (
          <Button key={id} size="sm" variant="outline" onClick={() => scrollToStatement(id)}>
            {label}
          </Button>
        ))}
      </div>

      <div className="print-only">
        <h2 className="text-3xl font-black">Financial Statements</h2>
        <p className="mt-1 text-sm">{bankPeriod} · Receivables as of {data.asOfLabel}</p>
      </div>

      <StatementSection
        id="statement-profit-loss"
        number="1"
        title="Profit & Loss"
        description="What the business earned, what it cost to operate, and the ownership money that moved below the operating result."
        period={bankPeriod}
      >
        <div className="space-y-5">
          <div>
            <Subheading>Money earned</Subheading>
            <div className="divide-y">
              {data.revenueLines.length > 0
                ? data.revenueLines.map((line) => <MoneyLine key={line.key} line={line} money={money} />)
                : <p className="py-3 text-sm text-muted-foreground">No classified revenue in this bank record.</p>}
            </div>
            <TotalLine label="Total operating revenue" amount={summary.revenue} money={money} />
          </div>

          <div>
            <Subheading>Cost to operate</Subheading>
            <div className="divide-y">
              {data.expenseLines.length > 0
                ? data.expenseLines.map((line) => <MoneyLine key={line.key} line={line} money={money} signed />)
                : <p className="py-3 text-sm text-muted-foreground">No classified operating expenses in this bank record.</p>}
            </div>
            <TotalLine label="Total operating expenses" amount={summary.operatingExpenses} money={money} />
          </div>

          <div className="rounded-md bg-primary/5 px-4 py-1">
            <TotalLine label="Operating profit" amount={summary.operatingProfit} money={money} signed />
          </div>

          <div>
            <Subheading>Below the line — capital and draws</Subheading>
            <p className="mt-1 text-sm text-muted-foreground">
              These are ownership and financing movements. They change cash, but they are not operating income or operating expenses.
            </p>
            <div className="mt-2 divide-y">
              <MoneyLine line={{ key: "investor-capital", label: "Investor capital received", amount: summary.investorCapital }} money={money} />
              <MoneyLine line={{ key: "owner-draws", label: "Owner draws", amount: -data.drawSplit.owner }} money={money} signed />
              <MoneyLine line={{ key: "partner-draws", label: "Partner-side draws", amount: -data.drawSplit.partner }} money={money} signed />
              {data.drawSplit.unassigned > 0 && (
                <MoneyLine line={{ key: "unassigned-draws", label: "Draws without a recorded side", amount: -data.drawSplit.unassigned }} money={money} signed />
              )}
            </div>
            <TotalLine label="Result after capital and draws" amount={data.resultAfterCapitalAndDraws} money={money} signed />
            {summary.unresolvedCount > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Not included above: {money(summary.unresolvedAmount)} across {summary.unresolvedCount} bank rows still awaiting classification in Accounting.
              </p>
            )}
          </div>
        </div>
      </StatementSection>

      <StatementSection
        id="statement-cash-flow"
        number="2"
        title="Cash Flow Statement"
        description="How cash moved through the bank record: operations first, financing second, and every other recorded movement shown before the net change."
        period={bankPeriod}
      >
        <div className="space-y-5">
          <div>
            <Subheading>Operating cash flow</Subheading>
            <div className="divide-y">
              <MoneyLine line={{ key: "cf-revenue", label: "Customer revenue received", amount: summary.revenue }} money={money} />
              <MoneyLine line={{ key: "cf-opex", label: "Operating expenses paid, net of merchant refunds", amount: -summary.operatingExpenses }} money={money} signed />
            </div>
            <TotalLine label="Net cash from operations" amount={data.cashFlow.operating} money={money} signed />
          </div>

          <div>
            <Subheading>Financing cash flow</Subheading>
            <div className="divide-y">
              <MoneyLine line={{ key: "cf-capital", label: "Investor capital received", amount: summary.investorCapital }} money={money} />
              <MoneyLine line={{ key: "cf-owner-draws", label: "Owner draws paid out", amount: -data.drawSplit.owner }} money={money} signed />
              <MoneyLine line={{ key: "cf-partner-draws", label: "Partner-side draws paid out", amount: -data.drawSplit.partner }} money={money} signed />
              {data.drawSplit.unassigned > 0 && (
                <MoneyLine line={{ key: "cf-unassigned-draws", label: "Draws without a recorded side", amount: -data.drawSplit.unassigned }} money={money} signed />
              )}
            </div>
            <TotalLine label="Net cash from financing" amount={data.cashFlow.financing} money={money} signed />
          </div>

          <div>
            <Subheading>Other recorded movements</Subheading>
            <div className="divide-y">
              <MoneyLine
                line={{ key: "cf-other", label: "Asset purchases, transfers, and unresolved bank items, net", amount: data.cashFlow.other }}
                money={money}
                signed
              />
            </div>
          </div>

          <div className="rounded-md bg-primary/5 px-4 py-1">
            <TotalLine label="Net cash change for the bank-record period" amount={data.cashFlow.netCashChange} money={money} signed />
          </div>

          <div className="divide-y border-t">
            <BlankLine label="Beginning cash" blank="Not yet recorded — opening bank balance has not been entered" />
            <BlankLine label="Ending cash" blank="Cannot be calculated until beginning cash is recorded" />
          </div>
        </div>
      </StatementSection>

      <StatementSection
        id="statement-ar-aging"
        number="3"
        title="Accounts Receivable Aging"
        description="Every invoice still owed under the same definition used by Overview and Invoices, grouped by how long it has been past due."
        period={`As of ${data.asOfLabel} · ${bankPeriod}`}
        printAvoidBreak={false}
      >
        <div className="space-y-6">
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Age bucket</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Amount owed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.receivables.buckets.map((bucket) => (
                  <TableRow key={bucket.key}>
                    <TableCell className="font-medium">{bucket.label}</TableCell>
                    <TableCell className="text-right">{bucket.rows.length}</TableCell>
                    <TableCell className="text-right font-semibold">{money(bucket.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-bold">Total accounts receivable</TableCell>
                  <TableCell className="text-right font-bold">{data.receivables.count}</TableCell>
                  <TableCell className="text-right font-black">{money(data.receivables.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {data.receivables.count === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices currently meet the owed definition.</p>
          ) : data.receivables.buckets.filter((bucket) => bucket.rows.length > 0).map((bucket) => (
            <div key={bucket.key} className="space-y-2">
              <div className="flex items-baseline justify-between gap-4">
                <h4 className="font-bold">{bucket.label}</h4>
                <span className="tabular-nums font-bold">{money(bucket.total)}</span>
              </div>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bucket.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.customerName}</TableCell>
                        <TableCell>{row.invoiceNumber}</TableCell>
                        <TableCell>{formatDate(row.issueDate)}</TableCell>
                        <TableCell>{formatDate(row.dueDate)}</TableCell>
                        <TableCell>{row.daysPastDue > 0 ? `${row.daysPastDue} days past due` : row.dueDate ? "Not past due" : "No due date recorded"}</TableCell>
                        <TableCell className="text-right font-semibold">{money(row.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      </StatementSection>

      <StatementSection
        id="statement-expense-breakdown"
        number="4"
        title="Expense Breakdown"
        description="Where operating money went, by the same classification used in Accounting and the Expenses bank record."
        period={bankPeriod}
      >
        {data.expenseBreakdown.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classified operating expenses in this bank record.</p>
        ) : (
          <div className="space-y-4">
            {data.expenseBreakdown.lines.map((line) => (
              <div key={line.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="font-medium">{line.label}</span>
                  <span className="tabular-nums font-semibold">
                    {signedMoney(line.amount)} · {line.percentage.toFixed(2)}%
                  </span>
                </div>
                <Progress value={Math.max(0, Math.min(100, line.percentage))} className="h-2" />
              </div>
            ))}
            <TotalLine label="Total operating expenses" amount={data.expenseBreakdown.total} money={money} />
            <p className="text-sm text-muted-foreground">
              Shares are calculated against total operating expenses after merchant refunds, matching Accounting and Overview.
            </p>
          </div>
        )}
      </StatementSection>

      <StatementSection
        id="statement-balance-sheet"
        number="5"
        title="Balance Sheet"
        description="What can be supported from the warehouse today. Missing balances are labeled as blanks; no plug number is used to force this sheet to balance."
        period={`As of ${data.asOfLabel} · ${bankPeriod}`}
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <Subheading>Assets — what the business owns or is owed</Subheading>
            <div className="mt-2 divide-y">
              <BlankLine label="Cash and bank balances" blank="Opening balance not yet recorded" />
              <MoneyLine line={{ key: "bs-ar", label: "Accounts receivable", amount: data.balanceSheet.accountsReceivable }} money={money} />
            </div>
            <TotalLine label="Known assets, excluding cash" amount={data.balanceSheet.knownAssetsExcludingCash} money={money} />
          </div>

          <div>
            <Subheading>Liabilities — what the business owes</Subheading>
            <div className="mt-2 divide-y">
              <BlankLine label="Vehicle loan — Westlake" blank="Balance not yet recorded" />
              <MoneyLine line={{ key: "bs-investor", label: "Investor capital to be repaid", amount: data.balanceSheet.investorCapitalOwed }} money={money} />
            </div>
            <TotalLine label="Known liabilities, excluding vehicle loan" amount={data.balanceSheet.knownLiabilitiesExcludingVehicleLoan} money={money} />
          </div>

          <div>
            <Subheading>Equity — the owner’s position</Subheading>
            <div className="mt-2 divide-y">
              <MoneyLine line={{ key: "bs-result", label: "Operating result for the bank-record period", amount: summary.operatingProfit }} money={money} signed />
              <MoneyLine line={{ key: "bs-owner-draws", label: "Less: owner draws", amount: -data.drawSplit.owner }} money={money} signed />
              <MoneyLine line={{ key: "bs-partner-draws", label: "Less: partner-side draws", amount: -data.drawSplit.partner }} money={money} signed />
              {data.drawSplit.unassigned > 0 && (
                <MoneyLine line={{ key: "bs-unassigned-draws", label: "Less: draws without a recorded side", amount: -data.drawSplit.unassigned }} money={money} signed />
              )}
              <BlankLine label="Opening owner equity" blank="Not yet recorded" />
            </div>
            <TotalLine label="Known equity, excluding opening equity" amount={data.balanceSheet.knownEquityBeforeOpeningEquity} money={money} signed />
          </div>
        </div>

        <div className="mt-6 rounded-md border bg-muted/50 p-4 text-sm">
          <span className="font-bold">This balance sheet does not balance yet.</span>{" "}
          Cash, the Westlake vehicle-loan balance, and opening owner equity are not recorded in the warehouse. Until those three figures are entered, total assets and total liabilities plus equity cannot be calculated honestly.
        </div>
      </StatementSection>
    </div>
  );
};

export default StatementsTab;
