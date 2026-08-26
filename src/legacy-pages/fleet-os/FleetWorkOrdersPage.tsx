import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@packages/auth";
import { fetchFleetWorkOrdersPage, fetchAssignableTechnicians, subscribeToFleetList, type FleetWorkOrderSummary } from "@/application";
import { batchAssignFleetWorkOrders } from "@/application/commands/fleet-batch.command";
import { createFleetJobFromWorkOrders } from "@/application/commands";
import { CompleteFleetWorkOrderDialog } from "@/components/fleet/CompleteFleetWorkOrderDialog";
import { createInvoiceFromFleetWorkOrders } from "@/application/commands/invoices.command";
import { fetchInvoiceDetail, type InvoiceFullRow } from "@/application/queries/invoices.query";
import { SendInvoiceDialog } from "@/components/invoices/SendInvoiceDialog";
import { toast } from "@/components/ui/sonner";
import {
  ClipboardList,
  Search,
  Plus,
  Calendar,
  DollarSign,
  CheckSquare,
  CreditCard,
  CheckCircle2,
  Loader2,
  MoreVertical,
  ArrowUpDown,
  Wrench,
  Layers,
} from "lucide-react";

type WOStatus = "all" | "draft" | "scheduled" | "in_progress" | "completed" | "invoiced" | "paid";

const statusFlow: { value: WOStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "invoiced", label: "Invoiced" },
  { value: "paid", label: "Paid" },
];

const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/10 text-blue-600",
  in_progress: "bg-amber-500/10 text-amber-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  invoiced: "bg-purple-500/10 text-purple-600",
  paid: "bg-gray-500/10 text-gray-600",
  pending_review: "bg-yellow-500/10 text-yellow-600",
  assigned: "bg-indigo-500/10 text-indigo-600",
};

const priorityStyles: Record<string, string> = {
  low: "bg-slate-500/10 text-slate-500",
  normal: "bg-blue-500/10 text-blue-500",
  high: "bg-orange-500/10 text-orange-500",
  urgent: "bg-red-500/10 text-red-500",
};

interface TechOption { id: string; name: string }

const FleetWorkOrdersPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<FleetWorkOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [aggregates, setAggregates] = useState({ open: 0, active: 0, priority: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [techs, setTechs] = useState<TechOption[]>([]);
  const [batchTech, setBatchTech] = useState<string>("");
  const [batchDate, setBatchDate] = useState<string>("");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [completeOrder, setCompleteOrder] = useState<FleetWorkOrderSummary | null>(null);
  const [generatedInvoice, setGeneratedInvoice] = useState<InvoiceFullRow | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  const search = searchParams.get("q") ?? "";
  const statusFilter = (searchParams.get("status") as WOStatus) || "all";
  const clientFilter = searchParams.get("client") ?? "";
  const sort = searchParams.get("sort") ?? "scheduled_desc";
  const page = Math.max(Number(searchParams.get("page") ?? "1"), 1);
  const PAGE_SIZE = 20;

  const patchParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    if (!patch.page) next.set("page", "1");
    setSearchParams(next, { replace: true });
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [woData, techData] = await Promise.all([
      fetchFleetWorkOrdersPage({ userId: user.id, page, pageSize: PAGE_SIZE, search, status: statusFilter === "all" ? undefined : statusFilter, clientId: clientFilter || undefined, sort }),
      fetchAssignableTechnicians(),
    ]);
    setOrders(woData.rows);
    setTotal(woData.total);
    setCounts(woData.counts);
    setAggregates(woData.aggregates);
    setTechs(techData.map((t: any) => ({ id: t.id, name: t.name })));
    setLoading(false);
  }, [clientFilter, page, search, sort, statusFilter, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!user?.id) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return subscribeToFleetList(user.id, "fleet_work_orders", () => { clearTimeout(timer); timer = setTimeout(() => { void loadData(); }, 150); });
  }, [loadData, user?.id]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const paged = orders;
  const selectedOnPageCount = paged.filter((order) => selected.has(order.id)).length;
  const selectedOrders = orders.filter((order) => selected.has(order.id));
  const canCreateInvoice = selectedOrders.length > 0
    && selectedOrders.every((order) => order.status === "completed")
    && selectedOrders.every((order) => order.fleet_client_id === selectedOrders[0].fleet_client_id);
  // Mirrors create_fleet_job_for_work_orders_v1: 2+ open orders, one client, not already grouped.
  const canGroupAsJob = selectedOrders.length >= 2
    && selectedOrders.every((order) => !["completed", "invoiced", "paid", "cancelled", "canceled"].includes(order.status))
    && selectedOrders.every((order) => !order.fleet_job_id)
    && selectedOrders.every((order) => order.fleet_client_id && order.fleet_client_id === selectedOrders[0].fleet_client_id);

  const openCount = aggregates.open;
  const activeCount = aggregates.active;
  const priorityCount = aggregates.priority;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedOnPageCount === paged.length) {
      setSelected((prev) => {
        const next = new Set(prev);
        paged.forEach((order) => next.delete(order.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        paged.forEach((order) => next.add(order.id));
        return next;
      });
    }
  };

  const handleBatchApply = async () => {
    if (selected.size === 0) return;
    setBatchProcessing(true);
    try {
      const ids = Array.from(selected);

      // Assign tech / date
      if (batchTech || batchDate) {
        const result = await batchAssignFleetWorkOrders({
          workOrderIds: ids,
          technicianId: batchTech || undefined,
          scheduledDate: batchDate || undefined,
          status: batchTech ? "assigned" : undefined,
        });
        toast.success(`Updated ${result.success} work orders${result.failed ? ` (${result.failed} failed)` : ""}`);
      }

      setBatchDialogOpen(false);
      setSelected(new Set());
      setBatchTech("");
      setBatchDate("");
      await loadData();
    } catch (err) {
      toast.error("Batch operation failed");
    } finally {
      setBatchProcessing(false);
    }
  };

  const openCompleteDialog = (order: FleetWorkOrderSummary) => {
    setCompleteOrder(order);
  };

  const handleCreateInvoice = async () => {
    if (!canCreateInvoice) {
      toast.error("Select completed work orders for one fleet customer");
      return;
    }
    setBatchProcessing(true);
    try {
      const invoiceRes = await createInvoiceFromFleetWorkOrders(Array.from(selected));
      const invoiceId = invoiceRes.invoice_id;
      const invoice = await fetchInvoiceDetail(invoiceId);
      setGeneratedInvoice(invoice);
      setSendDialogOpen(true);
      setSelected(new Set());
      toast.success(`Invoice ${invoice.invoice_number} created`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create invoice");
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleGroupAsJob = async () => {
    if (!canGroupAsJob) {
      toast.error("Select 2+ open work orders for one fleet customer");
      return;
    }
    setBatchProcessing(true);
    try {
      const result = await createFleetJobFromWorkOrders(Array.from(selected));
      setSelected(new Set());
      toast.success(`Job ${result.jobNumber || ""} created with ${result.workOrders} work orders`, {
        action: { label: "View Job", onClick: () => navigate(`/fleet-os/jobs/${result.jobId}`) },
      });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to group work orders");
    } finally {
      setBatchProcessing(false);
    }
  };

  return (
    <FleetOSLayout title="Work Orders">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Maintenance operations</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Work order management</h1>
            <p className="mt-1 text-sm text-muted-foreground">Track, assign, and close every fleet maintenance cycle.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 && (
              <>
                {canCreateInvoice && (
                  <Button size="sm" onClick={handleCreateInvoice} disabled={batchProcessing}>
                    {batchProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
                    Create Invoice ({selected.size})
                  </Button>
                )}
                {canGroupAsJob && (
                  <Button size="sm" variant="secondary" onClick={handleGroupAsJob} disabled={batchProcessing}>
                    {batchProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Layers className="h-4 w-4 mr-1" />}
                    Group as Job ({selected.size})
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setBatchDialogOpen(true)}>
                  <CheckSquare className="h-4 w-4 mr-1" />
                  Batch Actions ({selected.size})
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => navigate("/fleet-os/work-orders/invoicing")}>
              <DollarSign className="h-4 w-4 mr-1" /> Close &amp; Invoice
            </Button>
            <Button onClick={() => navigate("/fleet-os/work-orders/new")}>
              <Plus className="h-4 w-4 mr-1" /> New Work Order
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-l-4 border-l-primary p-4 shadow-none"><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Open orders</p><p className="mt-1 text-3xl font-bold text-primary">{openCount}</p></Card>
          <Card className="border-l-4 border-l-amber-500 p-4 shadow-none"><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">In progress</p><p className="mt-1 text-3xl font-bold">{activeCount}</p></Card>
          <Card className="border-l-4 border-l-destructive p-4 shadow-none"><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">High priority</p><p className="mt-1 text-3xl font-bold text-destructive">{priorityCount}</p></Card>
        </div>

        <Card className="space-y-4 p-4 shadow-none">
        <Tabs value={statusFilter} onValueChange={(v) => patchParams({ status: v, page: "1" })}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
            {statusFlow.map((s) => (
              <TabsTrigger
                key={s.value}
                value={s.value}
                className="rounded-md border border-border px-3 py-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {s.label}
                {s.value !== "all" && counts[s.value] ? (
                  <span className="ml-1.5 text-[10px] opacity-70">{counts[s.value]}</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order #, PO #, client, vehicle, service type..."
              value={search}
              onChange={(e) => patchParams({ q: e.target.value || null, page: "1" })}
              className="h-10 pl-10"
            />
          </div>
          {paged.length > 0 && (
            <Button className="h-10" variant="outline" onClick={selectAll}>
              {selectedOnPageCount === paged.length ? "Deselect Page" : "Select Page"}
            </Button>
          )}
          <Button className="h-10" variant="outline" onClick={() => patchParams({ sort: sort === "scheduled_asc" ? "scheduled_desc" : "scheduled_asc" })}><ArrowUpDown className="mr-2 h-4 w-4" /> Due date</Button>
        </div>
        </Card>

        {/* Work Order List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : total === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">No work orders</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                {statusFilter !== "all"
                  ? `No ${statusFilter.replace("_", " ")} work orders found.`
                  : "Create your first work order to get started."}
              </p>
              <Button size="sm" onClick={() => navigate("/fleet-os/work-orders/new")}>
                <Plus className="h-4 w-4 mr-1" /> New Work Order
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden shadow-none">
            <div className="hidden grid-cols-[36px_1.1fr_1.5fr_1fr_1fr_120px_40px] items-center gap-3 border-b bg-muted/40 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
              <Checkbox checked={selectedOnPageCount === paged.length && paged.length > 0} onCheckedChange={selectAll} aria-label="Select page" />
              <span>Work order</span><span>Asset & service</span><span>Status</span><span>Customer</span><span>Due date</span><span />
            </div>
            {paged.map((o) => {
              const vehicle = o.fleet_vehicles;
              const client = o.fleet_clients;
              const isSelected = selected.has(o.id);
              return (
                <div
                  key={o.id}
                  className={`border-b px-4 py-4 transition-colors last:border-b-0 ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}
                >
                    <div className="grid items-center gap-3 md:grid-cols-[36px_1.1fr_1.5fr_1fr_1fr_120px_40px]">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(o.id)}
                        className="shrink-0"
                      />
                      <button
                        className="min-w-0 text-left"
                        onClick={() => navigate(`/fleet-os/work-orders/${o.id}?${searchParams.toString()}`)}
                      >
                            <p className="font-mono text-sm font-bold text-primary">{o.order_number || "—"}</p>
                            <p className="mt-1 text-[11px] capitalize text-muted-foreground">{o.priority || "normal"} priority</p>
                      </button>
                      <button className="min-w-0 text-left" onClick={() => navigate(`/fleet-os/work-orders/${o.id}`)}>
                        <p className="truncate text-sm font-semibold">{vehicle ? `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}` : "Fleet vehicle"}</p>
                        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><Wrench className="h-3 w-3" />{o.service_type || "General service"}{vehicle?.unit_number && ` · #${vehicle.unit_number}`}</p>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className={statusStyles[o.status] || ""}>
                              {o.status.replace("_", " ")}
                            </Badge>
                            {o.priority !== "normal" && (
                              <Badge variant="secondary" className={priorityStyles[o.priority] || ""}>
                                {o.priority}
                              </Badge>
                            )}
                            {o.fleet_jobs?.job_number && (
                              <button
                                onClick={(event) => { event.stopPropagation(); navigate(`/fleet-os/jobs/${o.fleet_job_id}`); }}
                                title="View fleet job"
                              >
                                <Badge variant="outline" className="border-primary/40 text-primary">
                                  <Layers className="mr-1 h-3 w-3" />{o.fleet_jobs.job_number}
                                </Badge>
                              </button>
                            )}
                      </div>
                      <p className="truncate text-sm">{client?.company_name || <span className="italic text-muted-foreground">Unassigned</span>}</p>
                      <p className="flex items-center gap-1 text-xs"><Calendar className="h-3 w-3 text-muted-foreground" />{o.scheduled_date || "Unscheduled"}</p>
                        <div className="flex items-center justify-end gap-2">
                          {["scheduled", "assigned", "en_route", "arrived", "in_progress"].includes(o.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-500/30 text-emerald-600"
                              onClick={(event) => { event.stopPropagation(); openCompleteDialog(o); }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => navigate(`/fleet-os/work-orders/${o.id}`)}><MoreVertical className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </div>
              );
            })}
            <div className="flex flex-col items-center justify-between gap-3 bg-muted/20 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
              <span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} of {total} work orders</span>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => patchParams({ page: String(Math.max(currentPage - 1, 1)) })} disabled={currentPage <= 1}>Prev</Button><span className="flex items-center px-2">Page {currentPage} of {totalPages}</span><Button size="sm" variant="outline" onClick={() => patchParams({ page: String(Math.min(currentPage + 1, totalPages)) })} disabled={currentPage >= totalPages}>Next</Button></div>
            </div>
          </Card>
        )}
      </div>

      {/* Batch Actions Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Batch Actions — {selected.size} Work Orders</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Assign Technician</Label>
              <Select value={batchTech} onValueChange={setBatchTech}>
                <SelectTrigger>
                  <SelectValue placeholder="Select technician..." />
                </SelectTrigger>
                <SelectContent>
                  {techs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Schedule Date</Label>
              <Input
                type="date"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
              />
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleBatchApply}
              disabled={batchProcessing || (!batchTech && !batchDate)}
            >
              {batchProcessing ? "Processing..." : "Apply to All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompleteFleetWorkOrderDialog
        open={Boolean(completeOrder)}
        onOpenChange={(open) => { if (!open) setCompleteOrder(null); }}
        workOrderId={completeOrder?.id ?? null}
        workOrderLabel={completeOrder?.order_number}
        defaultMileage={completeOrder?.mileage_at_service}
        onCompleted={async () => { setCompleteOrder(null); await loadData(); }}
      />

      <SendInvoiceDialog
        invoice={generatedInvoice}
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        onSent={loadData}
      />
    </FleetOSLayout>
  );
};

export default FleetWorkOrdersPage;
