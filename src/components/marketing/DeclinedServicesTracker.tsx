/**
 * DeclinedServicesTracker - Track and follow up on declined service recommendations
 * 
 * Features:
 * - Log declined services during appointments
 * - Track potential lost revenue
 * - Schedule follow-ups
 * - Monitor conversion from follow-ups
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchDeclinedServicesData,
  type DeclinedServiceRow,
  type DeclinedServiceMetrics,
} from "@/application/queries/declined-services.query";
import {
  trackDeclinedService,
  sendDeclinedServiceFollowUp,
  markDeclinedServiceConverted,
} from "@/application/commands/declined-services.command";
import { AbandonedBookingsPanel } from "./AbandonedBookingsPanel";
import { LiveVisitorsPanel } from "./LiveVisitorsPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Plus,
  Send,
  Calendar,
  Car,
  User,
  Filter,
  Search,
  RefreshCw,
  Loader2,
  CircleDollarSign,
  Target,
  ArrowRight,
  Phone,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO, addDays, isPast, isToday, isFuture } from "date-fns";
import { cn } from "@/lib/utils";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";

type DeclinedService = DeclinedServiceRow;
type Metrics = DeclinedServiceMetrics;

const URGENCY_CONFIG = {
  required: { label: "Required", color: "bg-red-100 text-red-700 border-red-200", icon: AlertTriangle },
  recommended: { label: "Recommended", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  optional: { label: "Optional", color: "bg-blue-100 text-blue-700 border-blue-200", icon: CheckCircle2 },
};

const DECLINE_REASONS = [
  { value: "cost", label: "Too expensive" },
  { value: "time", label: "No time now" },
  { value: "not_needed", label: "Doesn't think it's needed" },
  { value: "will_do_later", label: "Will do it later" },
  { value: "going_elsewhere", label: "Going somewhere else" },
  { value: "other", label: "Other reason" },
];

const FOLLOW_UP_STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700" },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700" },
  converted: { label: "Converted", color: "bg-gray-100 text-gray-700" },
  expired: { label: "Expired", color: "bg-red-100 text-red-700" },
};

export function DeclinedServicesTracker() {
  const [loading, setLoading] = useState(true);
  const [declinedServices, setDeclinedServices] = useState<DeclinedService[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDecline, setNewDecline] = useState({
    customer_id: "",
    vehicle_id: "",
    recommended_service: "",
    catalog_item_id: "",
    estimated_cost: "",
    urgency: "recommended",
    decline_reason: "",
    decline_notes: "",
  });
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; info: string; customer_id: string }>>([]);

  const { formatCurrency } = useRegionalSettings();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDeclinedServicesData();
      setDeclinedServices(result.services);
      setMetrics(result.metrics);
      setCustomers(result.customers);
      setVehicles(result.vehicles);
    } catch (error) {
      console.error("Error fetching declined services:", error);
      toast.error("Failed to load declined services");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredServices = useMemo(() => {
    return declinedServices.filter((d) => {
      const matchesSearch =
        d.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.recommended_service?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.vehicle_info?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUrgency = urgencyFilter === "all" || d.urgency === urgencyFilter;
      const matchesStatus = statusFilter === "all" || d.follow_up_status === statusFilter;
      return matchesSearch && matchesUrgency && matchesStatus;
    });
  }, [declinedServices, searchQuery, urgencyFilter, statusFilter]);

  const handleAddDeclinedService = async () => {
    if (!newDecline.customer_id || !newDecline.recommended_service || !newDecline.estimated_cost) {
      toast.error("Please fill in required fields");
      return;
    }

    setSaving(true);
    try {
      await trackDeclinedService({
        customer_id: newDecline.customer_id,
        vehicle_id: newDecline.vehicle_id || null,
        recommended_service: newDecline.recommended_service,
        catalog_item_id: newDecline.catalog_item_id || null,
        estimated_cost: parseFloat(newDecline.estimated_cost),
        urgency: newDecline.urgency,
        decline_reason: newDecline.decline_reason || null,
        decline_notes: newDecline.decline_notes || null,
      });

      toast.success("Declined service tracked");
      setAddDialogOpen(false);
      setNewDecline({
        customer_id: "", vehicle_id: "", recommended_service: "",
        catalog_item_id: "", estimated_cost: "", urgency: "recommended",
        decline_reason: "", decline_notes: "",
      });
      fetchData();
    } catch (error) {
      console.error("Error tracking declined service:", error);
      toast.error(error instanceof Error ? error.message : "Failed to track declined service");
    } finally {
      setSaving(false);
    }
  };

  const handleSendFollowUp = async (service: DeclinedService) => {
    try {
      await sendDeclinedServiceFollowUp(service);
      toast.success("Follow-up sent");
      fetchData();
    } catch (error) {
      console.error("Error sending follow-up:", error);
      toast.error("Failed to send follow-up");
    }
  };

  const handleMarkConverted = async (service: DeclinedService) => {
    try {
      await markDeclinedServiceConverted(service.id);
      toast.success("Marked as converted!");
      fetchData();
    } catch (error) {
      console.error("Error marking converted:", error);
      toast.error("Failed to update status");
    }
  };

  const getUrgencyBadge = (urgency: DeclinedService["urgency"]) => {
    const config = URGENCY_CONFIG[urgency];
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={cn("gap-1", config.color)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getFollowUpStatus = (service: DeclinedService) => {
    const config = FOLLOW_UP_STATUS_CONFIG[service.follow_up_status];
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const customerVehicles = useMemo(() => {
    if (!newDecline.customer_id) return [];
    return vehicles.filter((v) => v.customer_id === newDecline.customer_id);
  }, [newDecline.customer_id, vehicles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Declined Services</h2>
          <p className="text-muted-foreground">
            Track recommendations customers declined and recover lost revenue
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Log Declined Service
        </Button>
      </div>

      {/* Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Declined</p>
                  <p className="text-2xl font-bold">{metrics.totalDeclined}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Lost Revenue</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(metrics.totalLostRevenue)}
                  </p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Follow-ups</p>
                  <p className="text-2xl font-bold">{metrics.pendingFollowUps}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Conversion Rate</p>
                  <p className="text-2xl font-bold text-gray-600">
                    {metrics.conversionRate.toFixed(1)}%
                  </p>
                </div>
                <Target className="h-8 w-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Recovered</p>
                  <p className="text-2xl font-bold text-gray-600">
                    {formatCurrency(metrics.recoveredRevenue)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Live visitor presence (heartbeat from public booking pages) */}
      <LiveVisitorsPanel />

      {/* Abandoned booking carts (cookie-tracked from step 1 of the public booking flow) */}
      <AbandonedBookingsPanel />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers, services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Urgency</SelectItem>
                <SelectItem value="required">Required</SelectItem>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="optional">Optional</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer / Vehicle</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServices.map((service) => {
                  const followUpDate = service.follow_up_scheduled_for 
                    ? parseISO(service.follow_up_scheduled_for) 
                    : null;
                  const isOverdue = followUpDate && isPast(followUpDate) && service.follow_up_status === "pending";

                  return (
                    <TableRow key={service.id} className={cn(isOverdue && "bg-red-50")}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{service.customer_name}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            {service.vehicle_info}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{service.recommended_service}</TableCell>
                      <TableCell>{getUrgencyBadge(service.urgency)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(service.estimated_cost)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {DECLINE_REASONS.find((r) => r.value === service.decline_reason)?.label || 
                           service.decline_reason || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {followUpDate ? (
                          <div className={cn("text-sm", isOverdue && "text-red-600 font-medium")}>
                            {isToday(followUpDate) 
                              ? "Today" 
                              : format(followUpDate, "MMM d")}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getFollowUpStatus(service)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {service.follow_up_status === "pending" && (
                              <DropdownMenuItem onClick={() => handleSendFollowUp(service)}>
                                <Send className="h-4 w-4 mr-2" />
                                Send Follow-up
                              </DropdownMenuItem>
                            )}
                            {!service.was_converted && (
                              <DropdownMenuItem onClick={() => handleMarkConverted(service)}>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Mark Converted
                              </DropdownMenuItem>
                            )}
                            {service.customer_phone && (
                              <DropdownMenuItem asChild>
                                <a href={`tel:${service.customer_phone}`}>
                                  <Phone className="h-4 w-4 mr-2" />
                                  Call Customer
                                </a>
                              </DropdownMenuItem>
                            )}
                            {service.customer_email && (
                              <DropdownMenuItem asChild>
                                <a href={`mailto:${service.customer_email}`}>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Email Customer
                                </a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredServices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No declined services found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Add Declined Service Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Declined Service</DialogTitle>
            <DialogDescription>
              Track a service recommendation that the customer declined
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select
                value={newDecline.customer_id}
                onValueChange={(v) => setNewDecline({ ...newDecline, customer_id: v, vehicle_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newDecline.customer_id && customerVehicles.length > 0 && (
              <div className="space-y-2">
                <Label>Vehicle</Label>
                <Select
                  value={newDecline.vehicle_id}
                  onValueChange={(v) => setNewDecline({ ...newDecline, vehicle_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.info}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Recommended Service *</Label>
              <Input
                value={newDecline.recommended_service}
                onChange={(e) => setNewDecline({ ...newDecline, recommended_service: e.target.value })}
                placeholder="e.g., Brake Pad Replacement"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estimated Cost *</Label>
                <Input
                  type="number"
                  value={newDecline.estimated_cost}
                  onChange={(e) => setNewDecline({ ...newDecline, estimated_cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Urgency</Label>
                <Select
                  value={newDecline.urgency}
                  onValueChange={(v) => setNewDecline({ ...newDecline, urgency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="recommended">Recommended</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Decline Reason</Label>
              <Select
                value={newDecline.decline_reason}
                onValueChange={(v) => setNewDecline({ ...newDecline, decline_reason: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reason (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {DECLINE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={newDecline.decline_notes}
                onChange={(e) => setNewDecline({ ...newDecline, decline_notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDeclinedService} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DeclinedServicesTracker;
