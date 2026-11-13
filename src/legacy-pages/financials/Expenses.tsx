import { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Receipt, Clock, TrendingUp, FileEdit, Filter, Download, Inbox, ChevronLeft, ChevronRight, Repeat, Target, Landmark } from "lucide-react";
import { RecurringExpensesTab } from "@/components/expenses/RecurringExpensesTab";
import { BudgetForecastTab } from "@/components/expenses/BudgetForecastTab";
import { DocumentIntakeUploader } from "@/components/expenses/document-intake/DocumentIntakeUploader";
import { DocumentIntakeInbox } from "@/components/expenses/document-intake/DocumentIntakeInbox";
import { startOfMonth, addMonths, format, parseISO } from "date-fns";
import { useAuth } from "@packages/auth";
import { fetchExpenses, fetchExpenseCategories, ensureDefaultCategoriesSeeded, ensureDefaultVendorsSeeded, type ExpenseRow } from "@/application/queries/expenses.query";
import {
  fetchActiveVendorClassificationRules,
  fetchBankTransactions,
  type StoredBankTransaction,
} from "@/application/queries/accounting.query";
import {
  accountingClassificationLabel,
  isAccountingOperatingExpense,
  summarizeAccounting,
  type AccountingClassification,
} from "@/features/accounting/accounting-engine";
import type { VendorClassificationRule } from "@/features/accounting/vendor-rules";
import { BankExpenseLedger, buildBankExpenseGroups } from "@/components/expenses/BankExpenseLedger";
import { ScanReceiptDialog } from "@/components/expenses/ScanReceiptDialog";
import { ManualExpenseDialog } from "@/components/expenses/ManualExpenseDialog";
import { ExpenseTable } from "@/components/expenses/ExpenseTable";
import { ExpenseDetailPane } from "@/components/expenses/ExpenseDetailPane";
import { CategoryBreakdownCard } from "@/components/expenses/CategoryBreakdownCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamRole } from "@/hooks/useTeamRole";

interface KpiCardProps { title: string; value: string; subtitle?: string; icon: React.ReactNode }

const KpiCard = ({ title, value, subtitle, icon }: KpiCardProps) => (
  <Card className="border-border/60">
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="size-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              {icon}
            </span>
            <p className="text-xs font-semibold uppercase tracking-widest">{title}</p>
          </div>
          <h3 className="text-3xl font-extralight mt-3 tracking-tight tabular-nums truncate">{value}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

export const ExpensesTab = () => {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [view, setView] = useState<"ledger" | "intake" | "recurring" | "forecast">("ledger");
  const [intakeRefresh, setIntakeRefresh] = useState(0);
  const [activeMonth, setActiveMonth] = useState(() => startOfMonth(new Date()));
  const { ownerUserId, loading: roleLoading } = useTeamRole();
  const { session } = useAuth();

  // The bank layer — the warehouse. Accounting is the record: this tab
  // reads the same bank transactions through the same shared read the
  // Accounting tab and the Overview use, so every total here equals the
  // Accounting totals by construction. Nothing is copied into the
  // expenses tables; manual entries stay their own layer below.
  const [bankRows, setBankRows] = useState<StoredBankTransaction[]>([]);
  const [bankRules, setBankRules] = useState<VendorClassificationRule[]>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankFilter, setBankFilter] = useState<AccountingClassification | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    // Always scope to the tenant owner so invited team members
    // (managers/dispatchers) see the same Expense ledger as the owner.
    const tenantId = ownerUserId ?? session?.user?.id ?? null;
    if (!tenantId) { setLoading(false); return; }

    try { await ensureDefaultCategoriesSeeded(tenantId); } catch (e) { console.warn(e); }
    try { await ensureDefaultVendorsSeeded(tenantId); } catch (e) { console.warn(e); }

    const monthStart = activeMonth.toISOString().slice(0, 10);
    const nextMonthStart = addMonths(activeMonth, 1).toISOString().slice(0, 10);
    const [{ data: cats }, { data: exps }] = await Promise.all([
      fetchExpenseCategories(tenantId),
      fetchExpenses(tenantId, monthStart, nextMonthStart),
    ]);
    const map: Record<string, string> = {};
    (cats ?? []).forEach((c) => { map[c.id] = c.name; });
    setCategoryMap(map);
    setExpenses((exps as ExpenseRow[]) ?? []);
    setLoading(false);
  }, [activeMonth, ownerUserId, session?.user?.id]);

  const loadBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const [rows, rules] = await Promise.all([
        fetchBankTransactions(),
        fetchActiveVendorClassificationRules(),
      ]);
      setBankRows(rows);
      setBankRules(rules);
      setBankError(null);
    } catch (e) {
      setBankError(e instanceof Error ? e.message : "Failed to load the bank record.");
    } finally {
      setBankLoading(false);
    }
  }, []);

  useEffect(() => { if (!roleLoading) void Promise.resolve().then(() => load()); }, [load, roleLoading]);
  useEffect(() => { if (!roleLoading) void Promise.resolve().then(() => loadBank()); }, [loadBank, roleLoading]);

  const selected = useMemo(() => expenses.find((e) => e.id === selectedId) ?? null, [expenses, selectedId]);

  const manualTotal = useMemo(
    () => expenses.filter((e) => e.status !== "rejected").reduce((s, e) => s + Number(e.total_amount), 0),
    [expenses],
  );
  const manualPendingCount = expenses.filter((e) => e.status === "pending").length;

  // Bank figures — the shared summary engine over the shared read. These
  // are the Accounting tab's numbers, not a second computation of them.
  const bankSummary = useMemo(
    () => summarizeAccounting(bankRows.map((row) => ({ amount: Number(row.amount), classification: row.classification }))),
    [bankRows],
  );
  const bankGroups = useMemo(() => buildBankExpenseGroups(bankRows), [bankRows]);
  const bankRangeLabel = useMemo(() => {
    const postedDates = bankRows.map((row) => row.posted_on).filter(Boolean).sort();
    return postedDates.length > 0
      ? `${format(parseISO(postedDates[0]), "MMM d, yyyy")} – ${format(parseISO(postedDates[postedDates.length - 1]), "MMM d, yyyy")}`
      : null;
  }, [bankRows]);
  const bankPendingCount = useMemo(
    () => bankRows.filter((row) => row.review_status === "pending").length,
    [bankRows],
  );
  const bankTopVendor = useMemo(() => {
    const totals = new Map<string, number>();
    bankGroups.forEach((group) => group.rows.forEach((row) => {
      totals.set(row.description_raw, (totals.get(row.description_raw) ?? 0) + Math.abs(Number(row.amount)));
    }));
    let best = ""; let max = 0;
    totals.forEach((v, k) => { if (v > max) { max = v; best = k; } });
    return best || "—";
  }, [bankGroups]);
  const bankBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    bankRows.forEach((row) => {
      if (!isAccountingOperatingExpense(row.classification) || Number(row.amount) >= 0) return;
      const label = accountingClassificationLabel(row.classification);
      map.set(label, (map.get(label) ?? 0) + Math.abs(Number(row.amount)));
    });
    const total = Array.from(map.values()).reduce((sum, v) => sum + v, 0);
    return {
      total,
      items: Array.from(map.entries())
        .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100, percentage: total > 0 ? (amount / total) * 100 : 0 }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [bankRows]);

  if (loading || bankLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const monthLabel = format(activeMonth, "MMMM yyyy");

  return (
    <div className="space-y-6">
      {/* Premium header band */}
      <div className="rounded-lg border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Expense Ledger
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extralight tracking-tight mt-1">
              Sovereign Ledger
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {bankRangeLabel
                ? <>Bank record {bankRangeLabel} · manual entries tracked separately below</>
                : <>No bank record imported yet · manual entries for {monthLabel}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border/60 p-0.5 bg-muted/30 w-full sm:w-auto">
              <Button size="sm" variant={view === "ledger" ? "default" : "ghost"} onClick={() => setView("ledger")} className="h-8 px-3 text-xs gap-1.5 flex-1 sm:flex-initial">
                <Receipt className="h-3.5 w-3.5" /> Ledger
              </Button>
              <Button size="sm" variant={view === "intake" ? "default" : "ghost"} onClick={() => setView("intake")} className="h-8 px-3 text-xs gap-1.5 flex-1 sm:flex-initial">
                <Inbox className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Document </span>Intake
              </Button>
              <Button size="sm" variant={view === "recurring" ? "default" : "ghost"} onClick={() => setView("recurring")} className="h-8 px-3 text-xs gap-1.5 flex-1 sm:flex-initial">
                <Repeat className="h-3.5 w-3.5" /> Recurring
              </Button>
              <Button size="sm" variant={view === "forecast" ? "default" : "ghost"} onClick={() => setView("forecast")} className="h-8 px-3 text-xs gap-1.5 flex-1 sm:flex-initial">
                <Target className="h-3.5 w-3.5" /> Forecast
              </Button>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => setManualOpen(true)} className="gap-2 flex-1 sm:flex-initial">
                <FileEdit className="h-4 w-4" /> <span className="hidden sm:inline">Manual Entry</span><span className="sm:hidden">Manual</span>
              </Button>
              <Button onClick={() => setScanOpen(true)} className="gap-2 flex-1 sm:flex-initial">
                <Camera className="h-4 w-4" /> <span className="hidden sm:inline">Scan Receipt</span><span className="sm:hidden">Scan</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stable, always-mounted views — visibility toggled, no conditional unmount */}
      <div className={view === "intake" ? "block" : "hidden"} aria-hidden={view !== "intake"}>
        <div className="space-y-4">
          <DocumentIntakeUploader onUploaded={() => { setIntakeRefresh((n) => n + 1); load(); }} />
          <DocumentIntakeInbox refreshKey={intakeRefresh} onChanged={() => { setIntakeRefresh((n) => n + 1); load(); }} />
        </div>
      </div>

      <div className={view === "recurring" ? "block" : "hidden"} aria-hidden={view !== "recurring"}>
        <RecurringExpensesTab ownerUserId={ownerUserId ?? null} onLedgerChanged={load} />
      </div>

      <div className={view === "forecast" ? "block" : "hidden"} aria-hidden={view !== "forecast"}>
        <BudgetForecastTab ownerUserId={ownerUserId ?? null} />
      </div>

      <div className={view === "ledger" ? "block space-y-6" : "hidden"} aria-hidden={view !== "ledger"}>
        {/* KPIs — the bank record, from the shared Accounting summary. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Operating Expenses"
            value={`$${bankSummary.operatingExpenses.toFixed(2)}`}
            subtitle={bankRangeLabel ? `Bank record · ${bankRangeLabel}` : "No bank record imported"}
            icon={<Receipt className="h-4 w-4 text-primary" />}
          />
          <KpiCard
            title="Pending Review"
            value={String(bankPendingCount)}
            subtitle={bankPendingCount === 0 ? "Every classification approved" : "Bank classifications awaiting review"}
            icon={<Clock className="h-4 w-4 text-primary" />}
          />
          <KpiCard
            title="Top Vendor"
            value={bankTopVendor}
            subtitle={bankTopVendor === "—" ? "No bank spending yet" : "Largest bank spend"}
            icon={<TrendingUp className="h-4 w-4 text-primary" />}
          />
          <CategoryBreakdownCard breakdown={bankBreakdown.items} total={bankBreakdown.total} />
        </div>

        {/* Bank record — the warehouse layer. One set of books: these are
            the Accounting tab's transactions and totals, viewed by
            classification. Classification review happens in Accounting. */}
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Bank Record</h2>
            <p className="text-xs text-muted-foreground">
              {bankRangeLabel
                ? <>Classified bank transactions, {bankRangeLabel}. The same record the Accounting tab shows — review and reclassify there.</>
                : "Classified bank transactions will appear here once a statement is imported."}
            </p>
          </div>

          {bankError ? (
            <Card className="border-border/60">
              <CardContent className="p-6">
                <p className="text-sm text-destructive">Could not load the bank record: {bankError}</p>
              </CardContent>
            </Card>
          ) : bankGroups.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="p-12 text-center space-y-4">
                <div className="size-12 mx-auto rounded-md bg-muted flex items-center justify-center">
                  <Landmark className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">No bank record imported yet</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    Import a statement in the Accounting tab and the classified record appears here automatically — one set of books.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <BankExpenseLedger
              groups={bankGroups}
              filter={bankFilter}
              onFilterChange={setBankFilter}
              rules={bankRules}
            />
          )}
        </div>

        {/* Manual entries — their own layer on top of the bank record.
            Tracked separately and never added into the bank totals. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Manual Entries</h2>
                <p className="text-xs text-muted-foreground">
                  Receipts and entries added by hand · {monthLabel} · ${manualTotal.toFixed(2)}
                  {manualPendingCount > 0 ? ` · ${manualPendingCount} pending approval` : ""}.
                  Tracked separately — not part of the bank record above.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => setActiveMonth((prev) => addMonths(prev, -1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => setActiveMonth(startOfMonth(new Date()))}
                >
                  This month
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => setActiveMonth((prev) => addMonths(prev, 1))}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5"><Filter className="h-3.5 w-3.5" /> Filter</Button>
                <Button size="sm" variant="ghost" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button>
              </div>
            </div>

            {expenses.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="p-12 text-center space-y-4">
                  <div className="size-12 mx-auto rounded-md bg-muted flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">No manual entries this month</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                      Tap "Scan Receipt" to add the first one and begin tracking your wealth flow.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button variant="outline" onClick={() => setManualOpen(true)} className="gap-2">
                      <FileEdit className="h-4 w-4" /> Manual Entry
                    </Button>
                    <Button onClick={() => setScanOpen(true)} className="gap-2">
                      <Camera className="h-4 w-4" /> Scan Receipt
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ExpenseTable
                expenses={expenses}
                categoryMap={categoryMap}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>

          <div>
            <ExpenseDetailPane
              expense={selected}
              categoryName={selected?.category_id ? categoryMap[selected.category_id] ?? null : null}
              onChanged={load}
                onEdit={(expense) => {
                  setEditingExpense(expense);
                  setManualOpen(true);
                }}
            />
          </div>
        </div>
      </div>

      <ScanReceiptDialog open={scanOpen} onOpenChange={setScanOpen} onSaved={load} />
      <ManualExpenseDialog
        open={manualOpen}
        onOpenChange={(next) => {
          setManualOpen(next);
          if (!next) setEditingExpense(null);
        }}
        onSaved={load}
        expense={editingExpense}
      />
    </div>
  );
};

export default ExpensesTab;
