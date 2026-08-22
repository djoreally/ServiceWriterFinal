import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchFleetInvoices, type FleetInvoiceRow } from "@/application/queries/fleet-invoices.query";
import { openFleetInvoiceWorkflow } from "@/application/navigation/fleet-invoice-routes";
import { normalizeFleetInvoiceStatus, type FleetInvoiceDisplayStatus } from "@/application/presenters/fleet-invoice-status";
import { InvoiceDetailDialog } from "@/components/invoices/InvoiceDetailDialog";
import { fleetInvoicesToCsv, summarizeFleetInvoiceOperations } from "@/application/presenters/fleet-invoice-operations";
import { useAuth } from "@packages/auth";
import {
  Receipt,
  Search,
  Plus,
  DollarSign,
  Building2,
  ChevronRight,
  Send,
  CheckCircle,
  FilePenLine,
  CircleDollarSign,
  Ban,
  Download,
  AlertTriangle,
} from "lucide-react";

type InvoiceFilter = "all" | FleetInvoiceDisplayStatus;

const statusFlow: { value: InvoiceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

const statusStyles: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-600",
  sent: "bg-blue-500/10 text-blue-600",
  partial: "bg-purple-500/10 text-purple-600",
  paid: "bg-emerald-500/10 text-emerald-600",
  void: "bg-muted text-muted-foreground",
};

const statusIcons: Record<string, any> = {
  draft: FilePenLine,
  sent: Send,
  partial: CircleDollarSign,
  paid: CheckCircle,
  void: Ban,
};

const FleetInvoicesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<FleetInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchFleetInvoices(user.id);
        setInvoices(data);
      } catch (error) {
        console.error("[FleetInvoicesPage] Failed to load invoices", error);
        setLoadError(error instanceof Error ? error.message : "Unable to load fleet invoices");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, reloadKey]);

  const filtered = invoices.filter((invoice) => {
    const invoiceStatus = normalizeFleetInvoiceStatus(invoice.status);
    if (filter !== "all" && invoiceStatus !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      invoice.invoice_number.toLowerCase().includes(q) ||
      invoice.fleet_clients?.company_name?.toLowerCase().includes(q)
    );
  });

  const counts: Record<string, number> = {};
  invoices.forEach((invoice) => {
    const s = normalizeFleetInvoiceStatus(invoice.status);
    counts[s] = (counts[s] || 0) + 1;
  });

  const totalOutstanding = invoices
    .filter((invoice) => !["paid", "void"].includes(normalizeFleetInvoiceStatus(invoice.status)))
    .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0)), 0);
  const operations = summarizeFleetInvoiceOperations(invoices);
  const exportInvoices = () => {
    const blob = new Blob([fleetInvoicesToCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fleet-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <FleetOSLayout title="Invoices">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
              {totalOutstanding > 0 && (
                <span className="ml-2 text-amber-600 font-medium">
                  • ${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })} outstanding
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportInvoices} disabled={filtered.length === 0}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => openFleetInvoiceWorkflow(navigate)}>
              <Plus className="h-4 w-4 mr-1" /> Generate Invoice
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            ["Outstanding", `$${operations.outstanding.toFixed(2)}`],
            ["Draft backlog", operations.draftCount],
            ["Overdue", operations.overdueCount],
            ["Delivery failures", operations.failedDeliveryCount],
            ["90+ days", `$${operations.aging["90+"].toFixed(2)}`],
          ].map(([label, value]) => (
            <Card key={label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value}</p></CardContent></Card>
          ))}
        </div>

        {/* Status Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as InvoiceFilter)}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
            {statusFlow.map((s) => (
              <TabsTrigger
                key={s.value}
                value={s.value}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs px-3 py-1.5 rounded-md border border-border data-[state=active]:border-primary"
              >
                {s.label}
                {s.value !== "all" && counts[s.value] ? (
                  <span className="ml-1.5 text-[10px] opacity-70">{counts[s.value]}</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by invoice # or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Invoice List */}
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading invoices...</p>
        ) : loadError ? (
          <Card role="alert" className="border-destructive/40">
            <CardContent className="py-12 text-center">
              <Receipt className="mx-auto mb-3 h-10 w-10 text-destructive/60" />
              <p className="font-medium">Invoices could not be loaded</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {loadError}. Check your connection and try again.
              </p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">No invoices</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter !== "all"
                  ? `No ${filter} invoices found.`
                  : "Invoices are generated from completed work orders."}
              </p>
              {filter === "all" && (
                <Button className="mt-4" size="sm" onClick={() => openFleetInvoiceWorkflow(navigate)}>
                  Review completed work orders
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((invoice) => {
              const invoiceStatus = normalizeFleetInvoiceStatus(invoice.status);
              const StatusIcon = statusIcons[invoiceStatus] || Receipt;
              const client = invoice.fleet_clients;
              const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0));
              return (
                <Card
                  key={invoice.id}
                  className="cursor-pointer hover:border-primary/30 transition-colors"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedInvoiceId(invoice.id);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{invoice.invoice_number}</p>
                          <Badge variant="secondary" className={statusStyles[invoiceStatus] || ""}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {invoiceStatus}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                          {client?.company_name && (
                            <span className="flex items-center gap-1 text-primary font-medium">
                              <Building2 className="h-3 w-3" /> {client.company_name}
                            </span>
                          )}
                          <span>Issued {new Date(invoice.issue_date).toLocaleDateString()}</span>
                          {invoice.due_date && <span>Due {new Date(invoice.due_date).toLocaleDateString()}</span>}
                          {Number(invoice.amount_paid) > 0 && <span>${Number(invoice.amount_paid).toFixed(2)} paid</span>}
                          {invoice.delivery_status === "failed" && (
                            <span className="flex items-center gap-1 text-destructive" title={invoice.delivery_last_error || undefined}>
                              <AlertTriangle className="h-3 w-3" /> Delivery failed — open to retry
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold flex items-center gap-0.5">
                          <DollarSign className="h-3.5 w-3.5" />
                          {balance.toFixed(2)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        open={Boolean(selectedInvoiceId)}
        onOpenChange={(open) => !open && setSelectedInvoiceId(null)}
        onChanged={() => setReloadKey((key) => key + 1)}
      />
    </FleetOSLayout>
  );
};

export default FleetInvoicesPage;
