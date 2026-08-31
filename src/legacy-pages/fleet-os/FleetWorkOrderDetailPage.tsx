import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import {
  RepairEstimatorDialog,
  type RepairEstimatorApplyPayload,
} from "@/components/pricing/RepairEstimatorDialog";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Package, Radio, MapPin as MapPinIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { FleetActivityFeed } from "@/components/fleet/FleetActivityFeed";
import { WorkOrderPartsPanel } from "@/components/parts/WorkOrderPartsPanel";
import { VehicleFilterMatchCard } from "@/components/vehicles/VehicleFilterMatchCard";
import { FleetApprovalEngine } from "@/components/fleet/FleetApprovalEngine";
import { CompleteFleetWorkOrderDialog } from "@/components/fleet/CompleteFleetWorkOrderDialog";
import { chargeFleetWorkOrder } from "@/application";
import {
  fetchFleetWorkOrderDetail,
  fetchAssignableTechnicians,
  type FleetWorkOrderDetailResult,
} from "@/application/queries";
import {
  advanceFleetWorkOrderStatus,
  assignFleetWorkOrderWithOverride,
  getFleetDispatchScoreBreakdown,
  requestFleetWorkOrderApproval,
  addFleetWorkOrderLineItem,

  deleteFleetWorkOrderLineItem,
  updateFleetWorkOrderDetails,
  updateFleetWorkOrderLineItem,
  updateFleetWorkOrderNotes,
  updateFleetWorkOrderSchedule,
} from "@/application/commands";
import { createInvoiceFromFleetWorkOrder } from "@/application/commands/invoices.command";
import { fetchInvoiceDetail, type InvoiceFullRow } from "@/application/queries/invoices.query";
import { SendInvoiceDialog } from "@/components/invoices/SendInvoiceDialog";
import {
  fetchContractServicesForClient,
  type FleetContractServiceRow,
} from "@/application/queries/fleet-contract-services.query";
import {
  ArrowLeft,
  Car,
  Building2,
  FileText,
  MapPin,
  Clock,
  Calendar,
  DollarSign,
  ClipboardList,
  Play,
  CheckCircle,
  Receipt,
  CreditCard,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  ShoppingCart,
  Gauge,
  Wrench,
  Send,
  type LucideIcon,
} from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import type {
  FleetActivityLog,
  FleetApproval,
  FleetWorkOrderDetail,
  FleetWorkOrderLineItem,
  FleetWorkOrderStatus,
} from "@/application/queries";
import type { DispatchScoreBreakdown } from "@/application/commands";
import { toDollars } from "@/lib/money";
import { getNextFleetWorkOrderStatus } from "@/domain/fleet/work-order-lifecycle";

// Status lifecycle
const STATUS_ACTIONS: Partial<Record<FleetWorkOrderStatus, { label: string; icon: LucideIcon; color: string }>> = {
  pending_review: { label: "Approve & Schedule", icon: Send, color: "bg-blue-600 hover:bg-blue-700 text-white" },
  draft: { label: "Submit & Schedule", icon: Send, color: "bg-blue-600 hover:bg-blue-700 text-white" },
  scheduled: { label: "Start Service", icon: Play, color: "bg-amber-600 hover:bg-amber-700 text-white" },
  assigned: { label: "Start Service", icon: Play, color: "bg-amber-600 hover:bg-amber-700 text-white" },
  en_route: { label: "Mark Arrived", icon: MapPin, color: "bg-indigo-600 hover:bg-indigo-700 text-white" },
  arrived: { label: "Start Service", icon: Play, color: "bg-amber-600 hover:bg-amber-700 text-white" },
  in_progress: { label: "Complete Service", icon: CheckCircle, color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  completed: { label: "Generate Invoice", icon: Receipt, color: "bg-purple-600 hover:bg-purple-700 text-white" },
  invoiced: { label: "Mark Paid", icon: CreditCard, color: "bg-gray-600 hover:bg-gray-700 text-white" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  pending_review: { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-400" },
  draft: { bg: "bg-muted/50", text: "text-muted-foreground", border: "border-border", dot: "bg-muted-foreground" },
  scheduled: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", dot: "bg-blue-400" },
  assigned: { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/30", dot: "bg-cyan-400" },
  en_route: { bg: "bg-indigo-500/15", text: "text-indigo-400", border: "border-indigo-500/30", dot: "bg-indigo-400" },
  arrived: { bg: "bg-violet-500/15", text: "text-violet-400", border: "border-violet-500/30", dot: "bg-violet-400" },
  in_progress: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", dot: "bg-amber-400 animate-pulse" },
  completed: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  invoiced: { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30", dot: "bg-purple-400" },
  paid: { bg: "bg-gray-500/15", text: "text-gray-400", border: "border-gray-500/30", dot: "bg-gray-400" },
  cancelled: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-400" },
};

type PaymentLogDetails = {
  amount?: number;
  payment_intent_id?: string;
};

function isJsonObject(value: Json | null): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePaymentLogDetails(value: Json | null): PaymentLogDetails | null {
  if (!isJsonObject(value)) return null;

  const amount = value.amount;
  const paymentIntentId = value.payment_intent_id;

  return {
    amount: typeof amount === "number" ? amount : undefined,
    payment_intent_id: typeof paymentIntentId === "string" ? paymentIntentId : undefined,
  };
}

const FleetWorkOrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backToList = `/fleet-os/work-orders${location.search || ""}`;

  const { user } = useAuth();

  const [order, setOrder] = useState<FleetWorkOrderDetail | null>(null);
  const [lineItems, setLineItems] = useState<FleetWorkOrderLineItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<FleetActivityLog[]>([]);
  const [approvals, setApprovals] = useState<FleetApproval[]>([]);
  const [loading, setLoading] = useState(true);

  // Service detail dialog
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [sendInvoiceOpen, setSendInvoiceOpen] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<InvoiceFullRow | null>(null);


  // Approval request dialog
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalTitle, setApprovalTitle] = useState("");
  const [approvalDesc, setApprovalDesc] = useState("");
  const [approvalCost, setApprovalCost] = useState("");

  // Add line item dialog
  const [showLineItemDialog, setShowLineItemDialog] = useState(false);
  const [showEstimatorDialog, setShowEstimatorDialog] = useState(false);

  const [showEditLineItemDialog, setShowEditLineItemDialog] = useState(false);
  const [newLineDesc, setNewLineDesc] = useState("");
  const [contractServices, setContractServices] = useState<FleetContractServiceRow[]>([]);
  const [selectedContractServiceId, setSelectedContractServiceId] = useState<string | null>(null);

  // Multi-tech state
  const [showAssignTechDialog, setShowAssignTechDialog] = useState(false);
  const [availableTechs, setAvailableTechs] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [techRole, setTechRole] = useState("helper");
  const [isPrimaryTech, setIsPrimaryTech] = useState(false);
  const [dispatchScoreRows, setDispatchScoreRows] = useState<DispatchScoreBreakdown[]>([]);
  const [dispatchOverrideReason, setDispatchOverrideReason] = useState("");

  const loadTechs = useCallback(async () => {
    const data = await fetchAssignableTechnicians();
    setAvailableTechs(data || []);
    if (id) {
      try {
        const breakdown = await getFleetDispatchScoreBreakdown(id);
        setDispatchScoreRows(breakdown);
        if (!selectedTechId && breakdown[0]?.technicianId) {
          setSelectedTechId(breakdown[0].technicianId);
        }
      } catch (error) {
        console.warn("[FleetWorkOrderDetailPage] dispatch score unavailable", error);
        setDispatchScoreRows([]);
      }
    }
  }, [id, selectedTechId]);

  const [newLineQty, setNewLineQty] = useState("1");
  const [newLinePrice, setNewLinePrice] = useState("");
  const [newLineType, setNewLineType] = useState("service");
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [scheduledDateDraft, setScheduledDateDraft] = useState("");
  const [scheduledTimeDraft, setScheduledTimeDraft] = useState("");
  const [serviceTypeDraft, setServiceTypeDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");

  // Simple card charge flow (virtual card keyed in by provider)
  const [isCharging, setIsCharging] = useState(false);
  const [showChargeDialog, setShowChargeDialog] = useState(false);
  const [cardToken, setCardToken] = useState("");
  // Stable per-attempt token: retries of the same attempt can never double-charge.
  const chargeIdempotencyKeyRef = useRef<string | null>(null);


  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result: FleetWorkOrderDetailResult = await fetchFleetWorkOrderDetail(id);
      setOrder(result.order);
      setNotesDraft(result.order?.notes ?? "");
      setScheduledDateDraft(result.order?.scheduled_date ?? "");
      setScheduledTimeDraft(result.order?.scheduled_time ?? "");
      setServiceTypeDraft(result.order?.service_type ?? "");
      setDescriptionDraft(result.order?.description ?? "");
      setLineItems(result.lineItems);
      setActivityLogs(result.activityLogs);
      setApprovals(result.approvals);
      loadTechs();

      // Load contract services for this client
      if (result.order?.fleet_client_id && result.order?.user_id) {
        try {
          const cs = await fetchContractServicesForClient(
            result.order.fleet_client_id,
            result.order.user_id,
          );
          setContractServices(cs);
        } catch {
          setContractServices([]);
        }
      }
    } catch (err) {
      console.error("[FleetWorkOrderDetailPage] Failed to load work order", err);
      toast.error("Failed to load work order");
    } finally {
      setLoading(false);
    }
  }, [id, loadTechs]);

  useEffect(() => { void Promise.resolve().then(() => fetchAll()); }, [fetchAll]);

  // Advance status
  const advanceStatus = async () => {
    if (!order) return;
    try {
      await advanceFleetWorkOrderStatus(order.id);
      toast.success("Status updated");
      fetchAll();
    } catch (err) {
      console.error("[FleetWorkOrderDetailPage] Failed to advance status", err);
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // Create invoice from WO, open Send dialog, then advance WO to 'invoiced'
  const generateAndSendInvoice = async () => {
    if (!order) return;
    setGeneratingInvoice(true);
    try {
      const invoiceId = await createInvoiceFromFleetWorkOrder(order.id);
      const invoice = await fetchInvoiceDetail(invoiceId);
      setGeneratedInvoice(invoice);
      setSendInvoiceOpen(true);
      // Advance WO status; if it fails (e.g. already invoiced), ignore
      try {
        await advanceFleetWorkOrderStatus(order.id);
      } catch (e) {
        console.warn("[FleetWorkOrderDetailPage] advance to invoiced skipped", e);
      }
      fetchAll();
    } catch (err) {
      console.error("[FleetWorkOrderDetailPage] Failed to generate invoice", err);
      toast.error(err instanceof Error ? err.message : "Failed to generate invoice");
    } finally {
      setGeneratingInvoice(false);
    }
  };

  // Request approval
  const submitApproval = async () => {
    if (!order) return;
    const estimated = approvalCost ? parseFloat(approvalCost) : undefined;
    try {
      await requestFleetWorkOrderApproval({
        workOrderId: order.id,
        title: approvalTitle,
        description: approvalDesc || null,
        estimatedCost:
          typeof estimated === "number" && !Number.isNaN(estimated) ? estimated : null,
      });

      toast.success("Approval requested");
      setShowApprovalDialog(false);
      setApprovalTitle("");
      setApprovalDesc("");
      setApprovalCost("");
      fetchAll();
    } catch (err) {
      console.error("[FleetWorkOrderDetailPage] Failed to request approval", err);
      toast.error("Failed to request approval");
    }
  };

  // Select a contract service to auto-fill line item
  const selectContractService = (svcId: string) => {
    const svc = contractServices.find((s) => s.id === svcId);
    if (!svc) {
      setSelectedContractServiceId(null);
      return;
    }
    setSelectedContractServiceId(svcId);
    const price = svc.custom_price ?? svc.service_catalog?.default_price ?? 0;
    setNewLineDesc(svc.custom_label || svc.service_catalog?.name || "Service");
    setNewLinePrice(String(price));
    setNewLineType("service");
  };

  // Add line item
  const addLineItem = async () => {
    if (!order || !newLineDesc || !newLinePrice) return;
    const qty = parseFloat(newLineQty) || 1;
    const price = parseFloat(newLinePrice);
    if (Number.isNaN(price)) {
      toast.error("Unit price must be a number");
      return;
    }

    const selectedSvc = selectedContractServiceId
      ? contractServices.find((s) => s.id === selectedContractServiceId)
      : null;

    try {
      await addFleetWorkOrderLineItem({
        workOrderId: order.id,
        lineType: newLineType,
        description: newLineDesc,
        quantity: qty,
        unitPrice: toDollars(price),
        serviceCatalogId: selectedSvc?.service_catalog_id || null,
        fleetContractServiceId: selectedSvc?.id || null,
        priceSource: selectedSvc
          ? (selectedSvc.custom_price != null ? "contract" : "catalog")
          : "manual",
      });

      toast.success("Line item added");
      setShowLineItemDialog(false);
      setNewLineDesc("");
      setNewLineQty("1");
      setNewLinePrice("");
      setNewLineType("service");
      setSelectedContractServiceId(null);
      fetchAll();
    } catch (err) {
      console.error("[FleetWorkOrderDetailPage] Failed to add line item", err);
      toast.error("Failed to add line item");
    }
  };

  /**
   * Apply a market repair estimate to this work order as labor + part lines,
   * using the same shared pricing translation as Quotes and Service Catalog.
   */
  const applyEstimatorToWorkOrder = async ({ repair, lines, tier }: RepairEstimatorApplyPayload) => {
    if (!order) return;
    try {
      for (const line of lines) {
        await addFleetWorkOrderLineItem({
          workOrderId: order.id,
          lineType: line.kind === "labor" ? "labor" : "part",
          description: line.description,
          quantity: line.quantity,
          unitPrice: toDollars(line.unitPrice),
          priceSource: "manual",
        });
      }
      toast.success(`Added ${repair.title} at ${tier} market pricing`);
      setShowEstimatorDialog(false);
      fetchAll();
    } catch (err) {
      console.error("[FleetWorkOrderDetailPage] Failed to apply market estimate", err);
      toast.error("Failed to add market-priced lines");
    }
  };



  // Delete line item
  const deleteLineItem = async (lineId: string) => {
    if (!order) return;
    try {
      await deleteFleetWorkOrderLineItem(order.id, lineId);
      toast.success("Line item removed");
      fetchAll();
    } catch (err) {
      console.error("[FleetWorkOrderDetailPage] Failed to delete line item", err);
      toast.error("Failed to remove line item");
    }
  };

  const startEditLineItem = (lineItem: FleetWorkOrderLineItem) => {
    setEditingLineItemId(lineItem.id);
    setNewLineDesc(lineItem.description ?? "");
    setNewLineQty(String(lineItem.quantity ?? 1));
    setNewLinePrice(String(lineItem.unit_price ?? 0));
    setShowEditLineItemDialog(true);
  };

  const submitEditLineItem = async () => {
    if (!order || !editingLineItemId) return;
    const quantity = Number(newLineQty);
    const unitPrice = Number(newLinePrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      toast.error("Quantity and price must be valid numbers");
      return;
    }
    try {
      await updateFleetWorkOrderLineItem({
        workOrderId: order.id,
        lineItemId: editingLineItemId,
        description: newLineDesc,
        quantity,
        unitPrice: toDollars(unitPrice),
      });
      toast.success("Line item updated");
      setShowEditLineItemDialog(false);
      setEditingLineItemId(null);
      fetchAll();
    } catch (error) {
      console.error("[FleetWorkOrderDetailPage] Failed to update line item", error);
      toast.error("Failed to update line item");
    }
  };

  const saveNotes = async () => {
    if (!order) return;
    setIsSavingNotes(true);
    try {
      await updateFleetWorkOrderNotes(order.id, notesDraft || null);
      toast.success("Notes updated");
      fetchAll();
    } catch (error) {
      console.error("[FleetWorkOrderDetailPage] Failed to save notes", error);
      toast.error("Failed to save notes");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const saveSchedule = async () => {
    if (!order || !scheduledDateDraft) return;
    try {
      await updateFleetWorkOrderSchedule(order.id, {
        scheduledDate: scheduledDateDraft,
        scheduledTime: scheduledTimeDraft || null,
      });
      toast.success("Schedule updated");
      fetchAll();
    } catch (error) {
      console.error("[FleetWorkOrderDetailPage] Failed to update schedule", error);
      toast.error(error instanceof Error ? error.message : "Failed to update schedule");
    }
  };

  const saveWorkOrderDetails = async () => {
    if (!order) return;
    try {
      await updateFleetWorkOrderDetails(order.id, {
        serviceType: serviceTypeDraft || null,
        description: descriptionDraft || null,
      });
      toast.success("Work order updated");
      fetchAll();
    } catch (error) {
      console.error("[FleetWorkOrderDetailPage] Failed to update work order", error);
      toast.error(error instanceof Error ? error.message : "Failed to update work order");
    }
  };

  const handleAssignTech = async () => {
    if (!order || !selectedTechId || !canEditWorkOrder) return;
    try {
      const topRecommendation = dispatchScoreRows[0];
      const isOverride = Boolean(topRecommendation && topRecommendation.technicianId !== selectedTechId);
      await assignFleetWorkOrderWithOverride({
        workOrderId: order.id,
        technicianId: selectedTechId,
        overrideReason: isOverride ? dispatchOverrideReason : null,
      });
      toast.success("Technician assigned");
      setShowAssignTechDialog(false);
      setDispatchOverrideReason("");
      fetchAll();
    } catch (err) {
      console.error("[FleetWorkOrderDetailPage] Failed to assign technician", err);
      toast.error(err instanceof Error ? err.message : "Failed to assign technician");
    }
  };

  if (loading) {
    return (
      <FleetOSLayout title="Work Order">
        <div className="space-y-3">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </FleetOSLayout>
    );
  }

  if (!order) {
    return (
      <FleetOSLayout title="Work Order">
        <div className="text-center py-12">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Work order not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(backToList)}>
            Back to Work Orders
          </Button>
        </div>
      </FleetOSLayout>
    );
  }

  const vehicle = order.fleet_vehicles;
  const client = order.fleet_clients;
  const contract = order.fleet_contracts;
  const workOrderLocation = order.fleet_locations;
  const orderStatus = order.status as FleetWorkOrderStatus;
  const statusAction = STATUS_ACTIONS[orderStatus];
  const nextStatus = getNextFleetWorkOrderStatus(orderStatus);
  const flow = statusAction && nextStatus ? { ...statusAction, next: nextStatus } : null;
  const isDraft = order.status === "draft";
  const isPendingReview = order.status === "pending_review";
  const isLimitedEditable = order.status === "scheduled" || order.status === "assigned";
  const isRestrictedEditable = order.status === "in_progress";
  const canEditWorkOrder = isDraft || isPendingReview || isLimitedEditable;
  const canEditLineItems = isDraft || isLimitedEditable || isRestrictedEditable;
  const isEditable = canEditLineItems;

  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const lastPaymentLog = activityLogs.find((log) => log.action === "payment_received");
  const lastPaymentDetails = parsePaymentLogDetails(lastPaymentLog?.details ?? null);
  const assignmentLog = activityLogs.find((log) => log.action === "assigned");
  const assignedTechnician = order.technicians;
  const assignedTechnicianName = assignedTechnician?.name || (order as any).assigned_technician_name || null;
  const assignedTechnicianStatus = assignedTechnician?.status || null;
  const assignedTechnicianIsOnline = assignedTechnicianStatus && assignedTechnicianStatus !== "offline";
  const hasVehicle = Boolean(vehicle);
  const hasClient = Boolean(client);
  // SLA check
  const slaBreached = order.sla_deadline && new Date(order.sla_deadline) < new Date() && !order.completed_at;

  // Threshold check
  const overThreshold = contract?.approval_threshold && order.total > contract.approval_threshold;

  const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.draft;

  return (
    <FleetOSLayout title={`${order.order_number || "WO"}`}>
      {/* ═══ TOP COMMAND BAR ═══ */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(backToList)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight truncate">{order.order_number}</h1>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold uppercase tracking-wider ${statusColor.bg} ${statusColor.text} ${statusColor.border}`}>
                <span className={`h-2 w-2 rounded-md ${statusColor.dot}`} />
                {order.status.replace(/_/g, " ")}
              </div>
              {order.priority && order.priority !== "normal" && (
                <Badge variant={order.priority === "urgent" ? "destructive" : "outline"} className="text-[10px] uppercase font-bold">
                  {order.priority}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              {client?.company_name && (
                <button className="hover:text-foreground transition-colors font-medium" onClick={() => navigate(`/fleet-os/clients/${client.id}`)}>
                  {client.company_name}
                </button>
              )}
              {vehicle && (
                <>
                  <span className="text-muted-foreground/40">•</span>
                  <button className="hover:text-foreground transition-colors" onClick={() => navigate(vehicle?.id ? `/fleet-os/vehicles/${vehicle.id}` : "/fleet-os/vehicles")}>
                    {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.unit_number ? `#${vehicle.unit_number}` : ""}
                  </button>
                </>
              )}
              {order.scheduled_date && (
                <>
                  <span className="text-muted-foreground/40">•</span>
                  <span>{order.scheduled_date} {scheduledTimeDraft ? scheduledTimeDraft.slice(0, 5) : ""}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Operations cluster */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAssignTechDialog(true)} disabled={!canEditWorkOrder}>
            <Users className="h-3.5 w-3.5 mr-1" /> Assign Tech
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowApprovalDialog(true)} disabled={!isEditable}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Flag Issue
          </Button>
          {order.status === "in_progress" ? (
            <Button onClick={() => setShowServiceDialog(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" size="sm" disabled={!hasVehicle || !hasClient}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Complete Job
            </Button>
          ) : order.status === "completed" ? (
            <Button onClick={generateAndSendInvoice} className="bg-purple-600 hover:bg-purple-700 text-white text-xs" size="sm" disabled={generatingInvoice || !hasVehicle || !hasClient}>
              <Receipt className="h-3.5 w-3.5 mr-1" /> {generatingInvoice ? "Generating…" : "Generate Invoice"}
            </Button>
          ) : flow ? (
            <Button onClick={advanceStatus} className={`${flow.color} text-xs`} size="sm" disabled={!hasVehicle || !hasClient}>
              <flow.icon className="h-3.5 w-3.5 mr-1" /> {flow.label}
            </Button>
          ) : null}

        </div>
      </div>

      {/* ═══ ALERTS BAR ═══ */}
      {(slaBreached || (overThreshold && !order.approval_required) || pendingApprovals.length > 0 || !hasVehicle || !hasClient) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {slaBreached && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-500 font-medium">
              <AlertTriangle className="h-3 w-3" /> SLA BREACHED
            </div>
          )}
          {overThreshold && !order.approval_required && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-500 font-medium">
              <AlertTriangle className="h-3 w-3" /> Over threshold ${contract?.approval_threshold?.toFixed(0)}
            </div>
          )}
          {pendingApprovals.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded text-xs text-orange-500 font-medium">
              <AlertTriangle className="h-3 w-3" /> {pendingApprovals.length} pending approval{pendingApprovals.length > 1 ? "s" : ""}
            </div>
          )}
          {!hasVehicle && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-600 font-medium">
              <AlertTriangle className="h-3 w-3" /> No vehicle linked
            </div>
          )}
          {!hasClient && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-500 font-medium">
              <AlertTriangle className="h-3 w-3" /> No client linked
            </div>
          )}
        </div>
      )}

      {/* ═══ SPLIT PANEL LAYOUT ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-[calc(100vh-14rem)]">

        {/* ──── LEFT: CONTROL PANEL ──── */}
        <ScrollArea className="lg:col-span-3 pr-2">
          <div className="space-y-3">

            {/* Service Details Module */}
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Service Details</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {isDraft ? "Full edit" : isPendingReview ? "Editable" : isLimitedEditable ? "Limited" : isRestrictedEditable ? "Restricted" : "Locked"}
                  </Badge>
                  {canEditWorkOrder && (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={saveWorkOrderDetails}>
                      Save
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Service Type</span>
                  <Input className="h-8 text-sm mt-0.5" value={serviceTypeDraft} onChange={(e) => setServiceTypeDraft(e.target.value)} disabled={!canEditWorkOrder} />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Description</span>
                  <Input className="h-8 text-sm mt-0.5" value={descriptionDraft} onChange={(e) => setDescriptionDraft(e.target.value)} disabled={!canEditWorkOrder} />
                </div>
              </div>

              {/* Schedule row */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Date</span>
                  <Input type="date" className="h-8 text-xs mt-0.5" value={scheduledDateDraft} onChange={(e) => setScheduledDateDraft(e.target.value)} disabled={!canEditWorkOrder} />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Time</span>
                  <Input type="time" className="h-8 text-xs mt-0.5" value={scheduledTimeDraft ? scheduledTimeDraft.slice(0, 5) : ""} onChange={(e) => setScheduledTimeDraft(e.target.value ? `${e.target.value}:00` : "")} disabled={!canEditWorkOrder} />
                </div>
                {order.mileage_at_service && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Mileage</span>
                    <p className="text-sm font-medium mt-1">{order.mileage_at_service.toLocaleString()} mi</p>
                  </div>
                )}
                {order.labor_hours && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Labor</span>
                    <p className="text-sm font-medium mt-1">{order.labor_hours}h</p>
                  </div>
                )}
              </div>
              {canEditWorkOrder && (
                <Button size="sm" variant="outline" className="mt-2 text-[10px] h-7" onClick={saveSchedule}>
                  <Calendar className="h-3 w-3 mr-1" /> Update Schedule
                </Button>
              )}
            </div>

            {/* Notes Module */}
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Internal Notes</span>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={saveNotes} disabled={isSavingNotes}>
                  Save
                </Button>
              </div>
              <Textarea className="text-sm min-h-[60px] resize-none" value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Dispatch notes, instructions..." />
              {order.technician_notes && (
                <div className="mt-2 p-2 bg-muted/30 rounded border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Tech Notes</span>
                  <p className="text-xs mt-0.5">{order.technician_notes}</p>
                </div>
              )}
            </div>

            {/* Line Items Module */}
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Line Items</span>
                  <Badge variant="outline" className="text-[10px]">{lineItems.length}</Badge>
                </div>
                {isEditable && (
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowLineItemDialog(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                )}
              </div>
              {lineItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No line items</p>
              ) : (
                <div className="space-y-0">
                  {lineItems.map((li) => (
                    <div key={li.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">{li.line_type}</Badge>
                          <span className="text-xs truncate">{li.description}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{li.quantity} × ${li.unit_price?.toFixed(2)}{li.part_number ? ` • ${li.part_number}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold">${li.total?.toFixed(2)}</span>
                        {isEditable && (
                          <>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditLineItem(li)}><Pencil className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteLineItem(li.id)}><Trash2 className="h-3 w-3" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <Separator className="my-1.5" />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">${(order.subtotal || 0).toFixed(2)}</span>
                  </div>
                  {order.tax_amount > 0 && (
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Tax</span>
                      <span>${order.tax_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black mt-1 pt-1 border-t border-border">
                    <span>TOTAL</span>
                    <span>${(order.total || 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* ──── RIGHT: LIVE CONTEXT PANEL ──── */}
        <ScrollArea className="lg:col-span-2 border-l border-border pl-4">
          <div className="space-y-3">

            {/* Parts & Supplies Module */}
            <WorkOrderPartsPanel
              workOrderId={order.id}
              fleetVehicleId={vehicle?.id ?? null}
              editable={isEditable}
              onChanged={() => {
                void fetchAll();
              }}
            />



            {/* Vehicle Module */}
            {vehicle && (
              <div className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vehicle</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => navigate(vehicle?.id ? `/fleet-os/vehicles/${vehicle.id}` : "/fleet-os/vehicles")}>
                    View Profile →
                  </Button>
                </div>
                <p className="text-sm font-bold">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1.5">
                  {vehicle.vin && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase">VIN</span>
                      <p className="text-xs font-mono">{vehicle.vin}</p>
                    </div>
                  )}
                  {vehicle.unit_number && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase">Unit</span>
                      <p className="text-xs font-medium">#{vehicle.unit_number}</p>
                    </div>
                  )}
                  {vehicle.mileage && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase">Odometer</span>
                      <p className="text-xs font-medium">{vehicle.mileage.toLocaleString()} mi</p>
                    </div>
                  )}
                  {vehicle.license_plate && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase">Plate</span>
                      <p className="text-xs font-medium">{vehicle.license_plate}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Filter fitment for this (usually VIN-entered) fleet unit */}
            {vehicle?.year && vehicle?.make && vehicle?.model && (
              <VehicleFilterMatchCard
                title="Filter match"
                year={vehicle.year}
                make={vehicle.make}
                model={vehicle.model}
                engine={(vehicle as any).engine ?? null}
                vehicleKind="fleet"
                vehicleId={vehicle.id}
                allowConfirm
              />
            )}


            {/* Team / Tech Module */}
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assigned Tech</span>
                </div>
                {assignedTechnicianName && (
                  <div className="flex items-center gap-1">
                    <Radio className={`h-3 w-3 ${assignedTechnicianIsOnline ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
                    <span className={`text-[10px] font-medium ${assignedTechnicianIsOnline ? "text-emerald-500" : "text-muted-foreground"}`}>
                      {assignedTechnicianIsOnline ? "ONLINE" : assignedTechnicianStatus?.toUpperCase() || "ASSIGNED"}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-sm font-bold">{assignedTechnicianName || (order.assigned_technician_id ? "Assigned technician" : "Unassigned")}</p>
              {assignmentLog?.created_at && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Assigned {new Date(assignmentLog.created_at).toLocaleString()}
                </p>
              )}
            </div>

            {/* Location Module */}
            {workOrderLocation && (
              <div className="border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <MapPinIcon className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Location</span>
                </div>
                <p className="text-sm font-medium">{workOrderLocation.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {[workOrderLocation.address, workOrderLocation.city, workOrderLocation.state].filter(Boolean).join(", ")}
                </p>
              </div>
            )}

            {/* Contract + PO row */}
            <div className="grid grid-cols-2 gap-2">
              {contract && (
                <div className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="h-3.5 w-3.5 text-purple-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contract</span>
                  </div>
                  <p className="text-xs font-medium truncate">{contract.name}</p>
                  <p className="text-[10px] text-muted-foreground">SLA {contract.sla_hours}h • ${contract.approval_threshold}</p>
                </div>
              )}
              {order.po_number && (
                <div className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShoppingCart className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PO</span>
                  </div>
                  <p className="text-xs font-bold">{order.po_number}</p>
                </div>
              )}
            </div>

            {/* Financial Module */}
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Financial</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Invoice</span>
                  <Badge variant="outline" className="text-[10px]">{order.invoice_status || "pending"}</Badge>
                </div>
                {order.invoiced_at && (
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Invoiced</span>
                    <span>{new Date(order.invoiced_at).toLocaleDateString()}</span>
                  </div>
                )}
                {order.paid_at && (
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Paid</span>
                    <span>{new Date(order.paid_at).toLocaleDateString()}</span>
                  </div>
                )}
                {lastPaymentLog && (
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Last Payment</span>
                    <span>${(lastPaymentDetails?.amount ?? order.total ?? 0).toFixed(2)}{lastPaymentDetails?.payment_intent_id ? ` • PI…${lastPaymentDetails.payment_intent_id.slice(-8).toUpperCase()}` : ""}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between">
                  <span className="text-sm font-bold">Total</span>
                  <span className="text-lg font-black">${(order.total || 0).toFixed(2)}</span>
                </div>
                {order.status === "invoiced" && !order.paid_at && (
                  <Button className="w-full mt-2 bg-gray-600 hover:bg-gray-700 text-white text-xs" size="sm" onClick={() => { setCardToken(""); setShowChargeDialog(true); }}>
                    <CreditCard className="h-3.5 w-3.5 mr-1" /> Charge Card
                  </Button>
                )}
              </div>
            </div>

            {/* Activity / Approvals Tabs */}
            <Tabs defaultValue="activity">
              <TabsList className="w-full h-8">
                <TabsTrigger value="activity" className="flex-1 text-xs h-7">Activity</TabsTrigger>
                <TabsTrigger value="approvals" className="flex-1 text-xs h-7 relative">
                  Approvals
                  {pendingApprovals.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-amber-500 text-white text-[10px] rounded-md flex items-center justify-center">
                      {pendingApprovals.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="activity" className="mt-2">
                <div className="border border-border rounded-lg p-3">
                  <FleetActivityFeed logs={activityLogs} />
                </div>
              </TabsContent>
              <TabsContent value="approvals" className="mt-2">
                <div className="border border-border rounded-lg p-3 space-y-3">
                  {isEditable && (
                    <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setShowApprovalDialog(true)}>
                      <AlertTriangle className="h-3 w-3 mr-1" /> Request Approval
                    </Button>
                  )}
                  <FleetApprovalEngine approvals={approvals} onRefresh={fetchAll} userId={order?.user_id || ""} />
                </div>
              </TabsContent>
            </Tabs>

            {/* Map Placeholder */}
            <div className="border border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground/40">
              <MapPinIcon className="h-8 w-8 mb-2" />
              <span className="text-[10px] uppercase tracking-widest font-bold">Live Dispatch Map</span>
              <span className="text-[10px]">Coming soon</span>
            </div>
          </div>
        </ScrollArea>
      </div>

      <CompleteFleetWorkOrderDialog
        open={showServiceDialog}
        onOpenChange={setShowServiceDialog}
        workOrderId={order.id}
        workOrderLabel={order.order_number}
        defaultMileage={vehicle?.mileage ?? null}
        onCompleted={fetchAll}
      />

      {/* Approval Request Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">What needs approval?</label>
              <Input
                placeholder="e.g. Replace brake pads"
                value={approvalTitle}
                onChange={(e) => setApprovalTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Details about the additional work..."
                value={approvalDesc}
                onChange={(e) => setApprovalDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Estimated Cost</label>
              <Input
                type="number"
                step="0.01"
                placeholder="$0.00"
                value={approvalCost}
                onChange={(e) => setApprovalCost(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>Cancel</Button>
            <Button onClick={submitApproval} disabled={!approvalTitle}>
              <AlertTriangle className="h-4 w-4 mr-1" /> Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Market Repairs Estimator (shared with Quotes / Service Catalog) */}
      <RepairEstimatorDialog
        open={showEstimatorDialog}
        onOpenChange={setShowEstimatorDialog}
        vin={vehicle?.vin || null}
        title="Market pricing for this vehicle"
        onApply={applyEstimatorToWorkOrder}
      />

      {/* Add Line Item Dialog */}
      <Dialog open={showLineItemDialog} onOpenChange={setShowLineItemDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {vehicle?.vin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setShowLineItemDialog(false);
                  setShowEstimatorDialog(true);
                }}
              >
                <Gauge className="h-3.5 w-3.5 mr-1.5" /> Pull market pricing for this VIN
              </Button>
            )}

            {/* Contract Service Picker */}
            {contractServices.length > 0 && (
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Package className="h-3.5 w-3.5" /> Select from Contract Services
                </label>
                <ScrollArea className="max-h-36">
                  <div className="space-y-1">
                    {contractServices.map((svc) => {
                      const price = svc.custom_price ?? svc.service_catalog?.default_price ?? 0;
                      const isSelected = selectedContractServiceId === svc.id;
                      return (
                        <div
                          key={svc.id}
                          className={`flex items-center justify-between rounded border p-2 cursor-pointer transition-colors text-sm ${
                            isSelected ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                          }`}
                          onClick={() => selectContractService(isSelected ? "" : svc.id)}
                        >
                          <span className="truncate">
                            {svc.custom_label || svc.service_catalog?.name || "Service"}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="secondary" className="text-[10px]">
                              ${Number(price).toFixed(2)}
                              {svc.custom_price != null ? "" : " (default)"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Click a service to auto-fill, or enter manually below.
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Type</label>
              <div className="flex gap-2 mt-1">
                {["service", "part", "labor", "fee"].map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={newLineType === t ? "default" : "outline"}
                    onClick={() => setNewLineType(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="e.g. Full Synthetic Oil Change"
                value={newLineDesc}
                onChange={(e) => setNewLineDesc(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={newLineQty}
                  onChange={(e) => setNewLineQty(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Unit Price</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="$0.00"
                  value={newLinePrice}
                  onChange={(e) => setNewLinePrice(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLineItemDialog(false)}>Cancel</Button>
            <Button onClick={addLineItem} disabled={!newLineDesc || !newLinePrice}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditLineItemDialog} onOpenChange={setShowEditLineItemDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Description</Label>
              <Input value={newLineDesc} onChange={(e) => setNewLineDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" value={newLineQty} onChange={(e) => setNewLineQty(e.target.value)} />
              </div>
              <div>
                <Label>Unit Price</Label>
                <Input type="number" value={newLinePrice} onChange={(e) => setNewLinePrice(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditLineItemDialog(false)}>Cancel</Button>
            <Button onClick={submitEditLineItem}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Tech Dialog */}
      <Dialog open={showAssignTechDialog} onOpenChange={setShowAssignTechDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Technician</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Technician</Label>
              <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                <SelectTrigger><SelectValue placeholder="Choose a tech" /></SelectTrigger>
                <SelectContent>
                  {availableTechs.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={techRole} onValueChange={setTechRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="helper">Helper</SelectItem>
                  <SelectItem value="trainee">Trainee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assignment Scoring</Label>
              <div className="max-h-40 overflow-auto rounded border p-2 space-y-2">
                {dispatchScoreRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No scoring breakdown available.</p>
                ) : (
                  dispatchScoreRows.slice(0, 5).map((row) => (
                    <div key={row.technicianId} className={`rounded border p-2 ${row.technicianId === selectedTechId ? "border-primary" : ""}`}>
                      <p className="text-xs font-medium">{row.technicianName} • Score {row.totalScore}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Distance {row.factors.distance} • Time Fit {row.factors.timeFit} • Priority {row.factors.priority} • Grouping {row.factors.grouping} • Load {row.factors.load}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
            {dispatchScoreRows[0] && selectedTechId && dispatchScoreRows[0].technicianId !== selectedTechId && (
              <div>
                <Label>Override Reason</Label>
                <Textarea
                  value={dispatchOverrideReason}
                  onChange={(e) => setDispatchOverrideReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why you are overriding the top assignment recommendation"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={isPrimaryTech} onChange={e => setIsPrimaryTech(e.target.checked)} id="primary-check" />
              <Label htmlFor="primary-check">Set as Primary Technician</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignTechDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAssignTech}
              disabled={Boolean(dispatchScoreRows[0] && selectedTechId && dispatchScoreRows[0].technicianId !== selectedTechId && !dispatchOverrideReason.trim())}
            >
              Assign Tech
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Charge Card Dialog */}
      <Dialog open={showChargeDialog} onOpenChange={setShowChargeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Charge Virtual Card</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">
                Work Order Total: <span className="font-semibold">${(order.total || 0).toFixed(2)}</span>
              </p>
              <p className="mt-1">
                Enter the virtual card token or Payment Method ID provided by the fleet portal.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Virtual Card Token / Payment Method ID</label>
              <Input
                placeholder="e.g. pm_1234... or VIRTUAL-CARD-TOKEN"
                value={cardToken}
                onChange={(e) => setCardToken(e.target.value.trim())}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!isCharging) setShowChargeDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-gray-600 hover:bg-gray-700"
              disabled={isCharging || !cardToken}
              onClick={async () => {
                if (!order?.id || !cardToken) return;
                try {
                  setIsCharging(true);
                  if (!chargeIdempotencyKeyRef.current) {
                    chargeIdempotencyKeyRef.current = `${order.id}:${crypto.randomUUID()}`;
                  }
                  const result = await chargeFleetWorkOrder({
                    fleetWorkOrderId: order.id,
                    paymentMethodId: cardToken,
                    idempotencyKey: chargeIdempotencyKeyRef.current,
                  });
                  if (!result.success) {
                    // Hard failure (declined/validation) — allow a fresh attempt.
                    chargeIdempotencyKeyRef.current = null;
                    toast.error(result.error?.message || "Failed to charge card.");
                    return;
                  }

                  if (result.settled) {
                    chargeIdempotencyKeyRef.current = null;
                    toast.success("Payment captured for this work order.");
                  } else {
                    toast.info(
                      "Payment submitted and is still processing. This work order will be marked paid once Stripe confirms settlement.",
                    );
                  }
                  setShowChargeDialog(false);
                  fetchAll();
                } finally {
                  setIsCharging(false);
                }
              }}

            >
              <CreditCard className="h-4 w-4 mr-1" /> Charge Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendInvoiceDialog
        invoice={generatedInvoice}
        open={sendInvoiceOpen}
        onOpenChange={(o) => { setSendInvoiceOpen(o); if (!o) setGeneratedInvoice(null); }}
        onSent={() => fetchAll()}
      />
    </FleetOSLayout>

  );
};

export default FleetWorkOrderDetailPage;
