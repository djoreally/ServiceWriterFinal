import { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Receipt, Clock, TrendingUp, FileEdit, Filter, Download, Inbox, ChevronLeft, ChevronRight, Repeat, Target } from "lucide-react";
import { RecurringExpensesTab } from "@/components/expenses/RecurringExpensesTab";
import { BudgetForecastTab } from "@/components/expenses/BudgetForecastTab";
import { DocumentIntakeUploader } from "@/components/expenses/document-intake/DocumentIntakeUploader";
import { DocumentIntakeInbox } from "@/components/expenses/document-intake/DocumentIntakeInbox";
import { startOfMonth, addMonths, format } from "date-fns";
import { useAuth } from "@packages/auth";
import { fetchExpenses, fetchExpenseCategories, ensureDefaultCategoriesSeeded, ensureDefaultVendorsSeeded, type ExpenseRow } from "@/application/queries/expenses.query";
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{title}</p>
          </div>
          <h3 className="text-3xl font-extralight mt-3 tracking-tight tabular-nums truncate">{value}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
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

  useEffect(() => { if (!roleLoading) load(); }, [load, roleLoading]);

  const selected = useMemo(() => expenses.find((e) => e.id === selectedId) ?? null, [expenses, selectedId]);

  const mtdTotal = useMemo(
    () => expenses.filter((e) => e.status !== "rejected").reduce((s, e) => s + Number(e.total_amount), 0),
    [expenses],
  );
  const pendingCount = expenses.filter((e) => e.status === "pending").length;
  const topVendor = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => map.set(e.vendor_name_raw, (map.get(e.vendor_name_raw) ?? 0) + Number(e.total_amount)));
    let best = ""; let max = 0;
    map.forEach((v, k) => { if (v > max) { max = v; best = k; } });
    return best || "—";
  }, [expenses]);

  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    expenses.filter((e) => e.status !== "rejected").forEach((e) => {
      const name = e.category_id ? categoryMap[e.category_id] ?? "Uncategorized" : "Uncategorized";
      map.set(name, (map.get(name) ?? 0) + Number(e.total_amount));
    });
    const total = mtdTotal || 1;
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount, percentage: (amount / total) * 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, categoryMap, mtdTotal]);

  if (loading) {
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
      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 p-5 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Expense Ledger
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extralight tracking-tight mt-1">
              Sovereign Ledger
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Financial summary for {monthLabel}
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
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="MTD Expenses"
            value={`$${mtdTotal.toFixed(2)}`}
            subtitle={mtdTotal === 0 ? "No spending recorded this period" : "Tracked this month"}
            icon={<Receipt className="h-4 w-4 text-primary" />}
          />
          <KpiCard
            title="Pending Approvals"
            value={String(pendingCount)}
            subtitle={pendingCount === 0 ? "All clear — no pending actions" : "Awaiting review"}
            icon={<Clock className="h-4 w-4 text-primary" />}
          />
          <KpiCard
            title="Top Vendor"
            value={topVendor}
            subtitle={topVendor === "—" ? "No vendor activity this month" : "Largest spend"}
            icon={<TrendingUp className="h-4 w-4 text-primary" />}
          />
          <CategoryBreakdownCard breakdown={breakdown} total={mtdTotal} />
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Recent Activity</h2>
                <p className="text-xs text-muted-foreground">Your most recent ledger entries.</p>
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
                    <h3 className="font-semibold">No expenses yet</h3>
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
