import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Building2, Users, Search, AlertCircle, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAuth } from "@packages/auth";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import {
  fetchInvoiceList,
  type InvoiceListRow,
} from "@/application/queries/invoices.query";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import { InvoiceDetailDialog } from "@/components/invoices/InvoiceDetailDialog";
import { ListPagination, usePageSlice, DEFAULT_PAGE_SIZE } from "@/components/ui/list-pagination";
import { useDebounce } from "@/hooks/useDebounce";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  sent: "secondary",
  partial: "secondary",
  paid: "default",
  void: "destructive",
};

const PAID_STATUSES = new Set(["paid", "void"]);

export function InvoicesTab() {
  const { formatCurrency } = useRegionalSettings();
  const { session } = useAuth();
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "outstanding" | "paid">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const debouncedSearch = useDebounce(searchQuery, 250);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const userId = session?.user?.id;
      if (!userId) return;
      const data = await fetchInvoiceList(userId);
      setRows(data);
    } catch (err) {
      console.error("[InvoicesTab] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  // Outstanding = any invoice not in paid/void status with a remaining balance
  const { outstandingAmount, outstandingCount, paidCount } = useMemo(() => {
    let outstandingAmount = 0;
    let outstandingCount = 0;
    let paidCount = 0;
    for (const r of rows) {
      const total = Number(r.total) || 0;
      const paid = Number(r.amount_paid) || 0;
      const remaining = Math.max(total - paid, 0);
      if (!PAID_STATUSES.has(r.status) && remaining > 0.01) {
        outstandingAmount += remaining;
        outstandingCount += 1;
      } else if (r.status === "paid") {
        paidCount += 1;
      }
    }
    return { outstandingAmount, outstandingCount, paidCount };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter((r) => {
      const total = Number(r.total) || 0;
      const paid = Number(r.amount_paid) || 0;
      const remaining = Math.max(total - paid, 0);
      const isOutstanding = !PAID_STATUSES.has(r.status) && remaining > 0.01;
      if (statusFilter === "outstanding" && !isOutstanding) return false;
      if (statusFilter === "paid" && r.status !== "paid") return false;
      if (!q) return true;
      const billTo =
        r.bill_to_type === "fleet"
          ? r.fleet_clients?.company_name ?? ""
          : r.customers?.name ?? "";
      return (
        r.invoice_number.toLowerCase().includes(q) ||
        billTo.toLowerCase().includes(q) ||
        (r.contact_name?.toLowerCase().includes(q) ?? false) ||
        r.status.toLowerCase().includes(q)
      );
    });
  }, [rows, debouncedSearch, statusFilter]);

  useEffect(() => { void Promise.resolve().then(() => setPage(1)); }, [debouncedSearch, statusFilter, pageSize]);
  const pagedRows = usePageSlice(filteredRows, page, pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Invoices</h2>
          <p className="text-sm text-muted-foreground">
            Create, view, edit, and email invoices for retail customers and fleet clients.
          </p>
        </div>
        <Button onClick={() => { setEditId(null); setOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Invoice
        </Button>
      </div>

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`text-left rounded-lg border p-4 transition-colors ${statusFilter === "all" ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total invoices</p>
            <p className="text-2xl font-black mt-1">{rows.length.toLocaleString()}</p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("outstanding")}
            className={`text-left rounded-lg border p-4 transition-colors ${statusFilter === "outstanding" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : "border-border/50 hover:bg-muted/30"}`}
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-700 dark:text-amber-500">
              <AlertCircle className="h-3.5 w-3.5" /> Outstanding
            </div>
            <p className="text-2xl font-black mt-1 text-amber-700 dark:text-amber-500">
              {formatCurrency(outstandingAmount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {outstandingCount} unpaid invoice{outstandingCount === 1 ? "" : "s"}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("paid")}
            className={`text-left rounded-lg border p-4 transition-colors ${statusFilter === "paid" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-border/50 hover:bg-muted/30"}`}
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" /> Paid
            </div>
            <p className="text-2xl font-black mt-1">{paidCount.toLocaleString()}</p>
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-bold">No invoices yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first invoice to bill a retail customer or fleet client.
              </p>
            </div>
            <Button onClick={() => { setEditId(null); setOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Invoice
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoice number, customer, or status"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Card>
            <CardContent className="p-0">
              {filteredRows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No invoices match your filters.
                </div>
              ) : (
                <div className="divide-y">
                  {pagedRows.map((r) => {
                    const billTo =
                      r.bill_to_type === "fleet"
                        ? r.fleet_clients?.company_name ?? "Fleet Client"
                        : r.customers?.name ?? "Customer";
                    const total = Number(r.total) || 0;
                    const paid = Number(r.amount_paid) || 0;
                    const remaining = Math.max(total - paid, 0);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setViewId(r.id)}
                        className="w-full text-left flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {r.bill_to_type === "fleet" ? (
                            <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                          ) : (
                            <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold">{r.invoice_number}</span>
                              <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="capitalize">
                                {r.status}
                              </Badge>
                            </div>
                            <p className="text-sm truncate">{billTo}</p>
                            <p className="text-xs text-muted-foreground">
                              Issued {format(parseISO(r.issue_date), "MMM d, yyyy")}
                              {r.due_date && ` · Due ${format(parseISO(r.due_date), "MMM d, yyyy")}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black">{formatCurrency(total)}</p>
                          {paid > 0 && paid < total && (
                            <p className="text-xs text-muted-foreground">
                              Paid {formatCurrency(paid)}
                            </p>
                          )}
                          {remaining > 0.01 && !PAID_STATUSES.has(r.status) && (
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
                              Balance {formatCurrency(remaining)}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <ListPagination
                totalCount={filteredRows.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="invoices"
              />
            </CardContent>
          </Card>
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
