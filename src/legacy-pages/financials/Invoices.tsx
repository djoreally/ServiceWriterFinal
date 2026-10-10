import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Search, AlertCircle, TriangleAlert } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAuth } from "@packages/auth";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ui/responsive-table";
import {
  fetchInvoiceList,
  type InvoiceListRow,
} from "@/application/queries/invoices.query";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import { InvoiceDetailDialog } from "@/components/invoices/InvoiceDetailDialog";
import {
  invoiceBalance,
  isInvoiceOverdue,
  overdueDays,
  InvoiceStatusPill,
  OverduePill,
} from "@/components/invoices/invoice-ui";
import { ListPagination, usePageSlice, DEFAULT_PAGE_SIZE } from "@/components/ui/list-pagination";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "outstanding" | "overdue" | "paid";

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  outstanding: "Outstanding",
  overdue: "Overdue",
  paid: "Paid",
};

const SETTLED = new Set(["paid", "void"]);

function billToName(r: InvoiceListRow): string {
  return r.bill_to_type === "fleet"
    ? r.fleet_clients?.company_name ?? "Fleet client"
    : r.customers?.name ?? "Customer";
}

export function InvoicesTab() {
  const { formatCurrency } = useRegionalSettings();
  const { session } = useAuth();
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const debouncedSearch = useDebounce(searchQuery, 250);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userId = session?.user?.id;
      if (!userId) return;
      const data = await fetchInvoiceList(userId);
      setRows(data);
    } catch (err) {
      console.error("[InvoicesTab] load failed", err);
      setError("We couldn't load your invoices. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const stats = useMemo(() => {
    let outstandingAmount = 0;
    let outstandingCount = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    let collectedAmount = 0;
    let paidCount = 0;
    for (const r of rows) {
      collectedAmount += Number(r.amount_paid) || 0;
      const balance = invoiceBalance(r);
      const owed = !SETTLED.has(r.status) && balance > 0.01;
      if (owed) {
        outstandingAmount += balance;
        outstandingCount += 1;
        if (isInvoiceOverdue(r)) {
          overdueAmount += balance;
          overdueCount += 1;
        }
      } else if (r.status === "paid") {
        paidCount += 1;
      }
    }
    return { outstandingAmount, outstandingCount, overdueAmount, overdueCount, collectedAmount, paidCount };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter((r) => {
      const balance = invoiceBalance(r);
      const owed = !SETTLED.has(r.status) && balance > 0.01;
      if (statusFilter === "outstanding" && !owed) return false;
      if (statusFilter === "overdue" && !isInvoiceOverdue(r)) return false;
      if (statusFilter === "paid" && r.status !== "paid") return false;
      if (!q) return true;
      return (
        r.invoice_number.toLowerCase().includes(q) ||
        billToName(r).toLowerCase().includes(q) ||
        (r.contact_name?.toLowerCase().includes(q) ?? false) ||
        r.status.toLowerCase().includes(q)
      );
    });
  }, [rows, debouncedSearch, statusFilter]);

  useEffect(() => { void Promise.resolve().then(() => setPage(1)); }, [debouncedSearch, statusFilter, pageSize]);
  const pagedRows = usePageSlice(filteredRows, page, pageSize);

  const newInvoice = () => { setEditId(null); setOpen(true); };

  // Column definitions ranked by use/identity/value for mobile.
  // Priority 1 = stays on card. ID (priority 5) leaves first — nobody reads it on a phone.
  const invoiceColumns: ResponsiveColumn<InvoiceListRow>[] = useMemo(() => [
    {
      key: "customer",
      header: "Billed to",
      priority: 1,
      render: (r) => (
        <>
          <p className="font-medium truncate max-w-[220px]">{billToName(r)}</p>
          <p className="text-xs text-muted-foreground capitalize">{r.bill_to_type}</p>
        </>
      ),
      cardPrimary: (r) => billToName(r),
    },
    {
      key: "balance",
      header: "Balance",
      priority: 2,
      className: "text-right",
      render: (r) => {
        const balance = invoiceBalance(r);
        const overdue = isInvoiceOverdue(r);
        const owed = !SETTLED.has(r.status) && balance > 0.01;
        return (
          <span className={cn(
            "font-mono tabular-nums whitespace-nowrap",
            owed && (overdue ? "text-destructive font-semibold" : "text-amber-700 dark:text-amber-500 font-medium"),
            !owed && "text-muted-foreground",
          )}>
            {owed ? formatCurrency(balance) : "—"}
          </span>
        );
      },
      // One slot for the amount: top right, tabular figures. No label needed.
      cardAmount: (r) => {
        const balance = invoiceBalance(r);
        const owed = !SETTLED.has(r.status) && balance > 0.01;
        return owed ? formatCurrency(balance) : "Paid";
      },
    },
    {
      key: "status",
      header: "Status",
      priority: 3,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <InvoiceStatusPill status={r.status} />
          {isInvoiceOverdue(r) && <OverduePill days={overdueDays(r)} />}
        </div>
      ),
      cardMeta: (r) => [
        <span key="s" className="flex items-center gap-1.5">
          <InvoiceStatusPill status={r.status} />
          {isInvoiceOverdue(r) && <OverduePill days={overdueDays(r)} />}
        </span>,
      ],
    },
    {
      key: "due",
      header: "Due",
      priority: 4,
      render: (r) => r.due_date ? (
        <>
          <p className="font-mono text-muted-foreground">{format(parseISO(r.due_date), "MMM d, yyyy")}</p>
          {isInvoiceOverdue(r) && <p className="text-xs font-semibold text-destructive">Overdue {overdueDays(r)}d</p>}
        </>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
      // Labeled: "Due Mar 4" not bare "Mar 4"
      cardMeta: (r) => r.due_date ? [
        <span key="d">Due {format(parseISO(r.due_date), "MMM d")}</span>,
      ] : [],
    },
    {
      key: "invoice",
      header: "Invoice",
      priority: 5,
      render: (r) => (
        <span className="font-mono text-sm font-semibold">{r.invoice_number}</span>
      ),
      // ID hides on card, reveals on expand
      cardExpanded: (r) => (
        <p className="text-sm">
          <span className="text-muted-foreground">Invoice </span>
          <span className="font-mono font-semibold">{r.invoice_number}</span>
        </p>
      ),
    },
    {
      key: "total",
      header: "Total",
      priority: 6,
      className: "text-right",
      render: (r) => (
        <span className="font-mono tabular-nums whitespace-nowrap">
          {formatCurrency(Number(r.total))}
        </span>
      ),
      cardExpanded: (r) => (
        <p className="text-sm">
          <span className="text-muted-foreground">Total </span>
          <span className="font-mono tabular-nums">{formatCurrency(Number(r.total))}</span>
        </p>
      ),
    },
  ], [formatCurrency]);

  return (
    <div className="space-y-5">
      {/* Page header — the screen's single H1 (the app chrome title is global nav, not content) */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Billing</p>
          <h1 className="text-[30px] font-semibold leading-[1.2] tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            What&apos;s owed, what&apos;s paid, and what&apos;s overdue — at a glance.
          </p>
        </div>
        <Button onClick={newInvoice} className="gap-2">
          <Plus className="h-4 w-4" />
          New invoice
        </Button>
      </div>

      {loading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </>
      ) : error ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
            <div>
              <p className="text-lg font-semibold">Couldn&apos;t load invoices</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <Button onClick={() => load()} variant="outline">Try again</Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold">No invoices yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first invoice to bill a retail customer or fleet client.
              </p>
            </div>
            <Button onClick={newInvoice} className="gap-2">
              <Plus className="h-4 w-4" />
              New invoice
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI strip — money in mono; signal accent on the one key metric: outstanding */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" role="group" aria-label="Invoice totals">
            <KpiCard
              label="Outstanding"
              value={formatCurrency(stats.outstandingAmount)}
              sub={`${stats.outstandingCount} unpaid`}
              valueClassName="text-primary"
              active={statusFilter === "outstanding"}
              onSelect={() => setStatusFilter("outstanding")}
            />
            <KpiCard
              label="Overdue"
              value={formatCurrency(stats.overdueAmount)}
              sub={stats.overdueCount === 0 ? "nothing past due" : `${stats.overdueCount} past due`}
              valueClassName={stats.overdueCount > 0 ? "text-destructive" : undefined}
              active={statusFilter === "overdue"}
              onSelect={() => setStatusFilter("overdue")}
            />
            <KpiCard
              label="Collected"
              value={formatCurrency(stats.collectedAmount)}
              sub={`${stats.paidCount} paid`}
              active={statusFilter === "paid"}
              onSelect={() => setStatusFilter("paid")}
            />
            <KpiCard
              label="Total invoices"
              value={rows.length.toLocaleString()}
              active={statusFilter === "all"}
              onSelect={() => setStatusFilter("all")}
            />
          </div>

          {stats.overdueCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm">
                  <span className="font-semibold">{stats.overdueCount} overdue</span>
                  {" · "}
                  <span className="font-mono">{formatCurrency(stats.overdueAmount)}</span>
                  <span className="text-muted-foreground"> past due. A nudge today keeps cash flowing.</span>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStatusFilter("overdue")}>
                View overdue
              </Button>
            </div>
          )}

          {/* Controls: search + segmented filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice number or customer"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Search invoices"
              />
            </div>
            <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" role="group" aria-label="Filter invoices">
              {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  aria-pressed={statusFilter === f}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === f
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <p className="text-lg font-semibold">No invoices match these filters</p>
                <p className="text-sm text-muted-foreground">Try a different search or filter.</p>
                <Button
                  variant="outline"
                  onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
                >
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <ResponsiveTable<InvoiceListRow>
                columns={invoiceColumns}
                rows={pagedRows}
                rowKey={(r) => r.id}
                onViewRecord={(r) => setViewId(r.id)}
                emptyState={
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No invoices match.
                  </p>
                }
              />

              <ListPagination
                totalCount={filteredRows.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="invoices"
              />
            </>
          )}
        </>
      )}

      <CreateInvoiceDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditId(null); }}
        onSuccess={() => load()}
        invoiceId={editId}
      />

      <InvoiceDetailDialog
        invoiceId={viewId}
        open={!!viewId}
        onOpenChange={(v) => { if (!v) setViewId(null); }}
        onEdit={(id) => { setViewId(null); setEditId(id); setOpen(true); }}
        onChanged={() => load()}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName,
  active,
  onSelect,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "text-left rounded-xl border bg-card p-4 transition-colors",
        active ? "border-primary ring-1 ring-primary/40" : "hover:bg-muted/30",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-2xl font-semibold mt-1 tabular-nums", valueClassName)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </button>
  );
}
