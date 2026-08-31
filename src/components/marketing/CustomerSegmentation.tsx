/**
 * CustomerSegmentation - Manage customer segments and segmentation rules
 * 
 * Features:
 * - Create/edit/delete segments
 * - Define segmentation rules (value ranges, service counts, etc.)
 * - Auto-assign customers to segments
 * - View customers per segment
 */

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  fetchSegmentCustomers,
  subscribeCustomerSegmentUpdates,
} from "@/application/queries/marketing.query";
import {
  getCurrentUserId,
  fetchSegments as fetchSegmentRows,
} from "@/application/queries/customer-segmentation.query";
import {
  saveSegment as saveSegmentApi,
  deleteSegment as deleteSegmentApi,
  recalculateAllCustomers,
} from "@/application/commands/customer-segmentation.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Crown,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  AlertTriangle,
  Plus,
  Save,
  Trash2,
  Edit,
  RefreshCw,
  Loader2,
  ArrowUpDown,
  Wand2,
  ChevronRight,
  DollarSign,
  Calendar,
  Target,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { ProximityPicker } from "@/components/marketing/ProximityPicker";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  min_lifetime_value: number | null;
  max_lifetime_value: number | null;
  min_total_services: number | null;
  max_total_services: number | null;
  min_days_since_service: number | null;
  max_days_since_service: number | null;
  min_average_order: number | null;
  max_average_order: number | null;
  is_auto: boolean;
  priority: number;
  auto_follow_up_days: number | null;
  is_active: boolean;
  member_count: number;
  last_calculated_at: string | null;
  calculation_status: "stale" | "calculating" | "current" | "failed";
  calculation_error: string | null;
  geo_center_lat: number | null;
  geo_center_lng: number | null;
  geo_radius_miles: number | null;
}

const SEGMENT_ICONS: Record<string, React.ReactNode> = {
  crown: <Crown className="h-5 w-5" />,
  users: <Users className="h-5 w-5" />,
  user: <UserCheck className="h-5 w-5" />,
  "user-plus": <UserPlus className="h-5 w-5" />,
  "alert-triangle": <AlertTriangle className="h-5 w-5" />,
  "user-x": <UserX className="h-5 w-5" />,
};

const PRESET_COLORS = [
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ef4444", // red
  "#6b7280", // gray
  "#ec4899", // pink
  "#14b8a6", // teal
];

const DEFAULT_SEGMENT: Partial<Segment> = {
  name: "",
  description: "",
  color: "#3b82f6",
  icon: "users",
  min_lifetime_value: null,
  max_lifetime_value: null,
  min_total_services: null,
  max_total_services: null,
  min_days_since_service: null,
  max_days_since_service: null,
  min_average_order: null,
  max_average_order: null,
  is_auto: true,
  priority: 50,
  auto_follow_up_days: null,
  is_active: true,
};

export function CustomerSegmentation() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Partial<Segment> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [viewSegment, setViewSegment] = useState<Segment | null>(null);
  const [viewCustomers, setViewCustomers] = useState<Array<{ id: string; name: string; email: string | null; phone: string | null; lifetime_value: number | null; total_services: number | null; last_service_date: string | null }>>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const { formatCurrency } = useRegionalSettings();
  const navigate = useNavigate();

  const fetchSegmentsData = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    setLoading(true);
    try {
      const segmentData = await fetchSegmentRows(userId);
      setSegments(segmentData as Segment[]);
    } catch (error) {
      console.error("Error fetching segments:", error);
      toast.error("Failed to load segments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchSegmentsData());
  }, [fetchSegmentsData]);


  useEffect(() => {
    const { unsubscribe } = subscribeCustomerSegmentUpdates((next) => {
      const patch = next as Partial<Segment> & { id: string };
      setSegments((prev) => prev.map((s) => (s.id === patch.id ? { ...s, ...patch } : s)));
    });
    return unsubscribe;
  }, []);

  const handleSaveSegment = async () => {
    if (!editingSegment?.name) {
      toast.error("Segment name is required");
      return;
    }

    setSaving(true);
    try {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error("Not authenticated");

      await saveSegmentApi(userId, editingSegment, isEditing);
      toast.success(isEditing ? "Segment updated" : "Segment created");

      setDialogOpen(false);
      setEditingSegment(null);
      fetchSegmentsData();
    } catch (error) {
      console.error("Error saving segment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save segment");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSegment = async (segment: Segment) => {
    try {
      await deleteSegmentApi(segment.id);
      toast.success("Segment deleted");
      fetchSegmentsData();
    } catch (error) {
      console.error("Error deleting segment:", error);
      toast.error("Failed to delete segment");
    }
  };

  const handleRecalculateAll = async () => {
    setRecalculating(true);
    try {
      const count = await recalculateAllCustomers();
      toast.success(`Recalculated ${count} customers`);
      fetchSegmentsData();
    } catch (error) {
      console.error("Error recalculating:", error);
      toast.error("Failed to recalculate customers");
    } finally {
      setRecalculating(false);
    }
  };

  const openEditDialog = (segment?: Segment) => {
    if (segment) {
      setEditingSegment({ ...segment });
      setIsEditing(true);
    } else {
      setEditingSegment({ ...DEFAULT_SEGMENT });
      setIsEditing(false);
    }
    setDialogOpen(true);
  };

  const openViewDialog = async (segment: Segment) => {
    setViewSegment(segment);
    setViewLoading(true);
    setViewCustomers([]);
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;
      const { data, error } = await fetchSegmentCustomers(userId, segment.name);
      if (error) throw error;
      setViewCustomers((data || []) as any);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load segment customers");
    } finally {
      setViewLoading(false);
    }
  };

  const sendCampaignToSegment = (segment: Segment) => {
    navigate(`/growth-tools?tab=campaigns&segment=${encodeURIComponent(segment.name)}`);
  };

  const getSegmentIcon = (iconName: string) => {
    return SEGMENT_ICONS[iconName] || <Users className="h-5 w-5" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalCustomers = segments.reduce((sum, s) => sum + s.member_count, 0);
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Customer Segments</h2>
          <p className="text-muted-foreground">
            Organize customers into segments for targeted marketing
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRecalculateAll}
            disabled={recalculating}
          >
            {recalculating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            Recalculate All
          </Button>
          <Button onClick={() => openEditDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Segment
          </Button>
        </div>
      </div>

      {/* Segments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {segments.map((segment) => (
          <Card key={segment.id} className={cn(!segment.is_active && "opacity-60")}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${segment.color}20`, color: segment.color }}
                  >
                    {getSegmentIcon(segment.icon)}
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {segment.name}
                      {!segment.is_active && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs flex items-center gap-2 flex-wrap">
                      <span>Priority: {segment.priority}</span>
                      {segment.calculation_status === "calculating" && <Badge variant="secondary">Recalculating…</Badge>}
                      {segment.calculation_status === "failed" && <Badge variant="destructive">Failed</Badge>}
                      {segment.calculation_status === "current" && (!segment.last_calculated_at || differenceInHours(new Date(), new Date(segment.last_calculated_at)) > 24) && (
                        <Badge variant="outline">Stale</Badge>
                      )}
                    </CardDescription>
                    <p className="text-xs text-muted-foreground mt-1">
                      {segment.last_calculated_at
                        ? `Updated ${formatDistanceToNow(new Date(segment.last_calculated_at))} ago`
                        : "Never calculated"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(segment)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Segment?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove the "{segment.name}" segment. Customers won't be deleted but will lose this segment assignment.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteSegment(segment)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {segment.description && (
                <p className="text-sm text-muted-foreground mb-3">
                  {segment.description}
                </p>
              )}

              {/* Customer Count */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Customers</span>
                </div>
                <span className="text-lg font-bold">{segment.member_count}</span>
              </div>

              {/* Rules Summary */}
              <div className="space-y-2 text-sm">
                {segment.min_lifetime_value && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    <span>Min LTV: {formatCurrency(segment.min_lifetime_value)}</span>
                  </div>
                )}
                {segment.min_total_services && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Target className="h-3 w-3" />
                    <span>Min services: {segment.min_total_services}</span>
                  </div>
                )}
                {segment.max_days_since_service && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Active within {segment.max_days_since_service} days</span>
                  </div>
                )}
                {segment.auto_follow_up_days && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <RefreshCw className="h-3 w-3" />
                    <span>Auto follow-up: {segment.auto_follow_up_days} days</span>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="pt-0 flex flex-col gap-3">
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: totalCustomers > 0 ? `${(segment.member_count / totalCustomers) * 100}%` : "0%",
                    backgroundColor: segment.color,
                  }}
                />
              </div>
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openViewDialog(segment)}
                  disabled={segment.member_count === 0}
                >
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  View ({segment.member_count})
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={() => sendCampaignToSegment(segment)}
                  disabled={segment.member_count === 0}
                >
                  <Mail className="h-3.5 w-3.5 mr-1.5" />
                  Campaign
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}

        {segments.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No segments configured</p>
              <p className="text-muted-foreground mb-4">
                Create segments to organize your customers
              </p>
              <Button onClick={() => openEditDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Segment
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Segment" : "Create Segment"}
            </DialogTitle>
            <DialogDescription>
              Define segment properties and auto-assignment rules
            </DialogDescription>
          </DialogHeader>

          {editingSegment && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={editingSegment.name || ""}
                      onChange={(e) => setEditingSegment({ ...editingSegment, name: e.target.value })}
                      placeholder="VIP Customers"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Input
                      type="number"
                      value={editingSegment.priority || 50}
                      onChange={(e) => setEditingSegment({ ...editingSegment, priority: parseInt(e.target.value) })}
                      min={0}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">Higher = checked first</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={editingSegment.description || ""}
                    onChange={(e) => setEditingSegment({ ...editingSegment, description: e.target.value })}
                    placeholder="High-value loyal customers"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          "w-8 h-8 rounded-full border-2 transition-all",
                          editingSegment.color === color ? "border-foreground scale-110" : "border-transparent"
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditingSegment({ ...editingSegment, color })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Value Rules */}
              <div className="space-y-4">
                <h4 className="font-medium">Value Rules</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min Lifetime Value</Label>
                    <Input
                      type="number"
                      value={editingSegment.min_lifetime_value || ""}
                      onChange={(e) => setEditingSegment({ 
                        ...editingSegment, 
                        min_lifetime_value: e.target.value ? parseFloat(e.target.value) : null 
                      })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Lifetime Value</Label>
                    <Input
                      type="number"
                      value={editingSegment.max_lifetime_value || ""}
                      onChange={(e) => setEditingSegment({ 
                        ...editingSegment, 
                        max_lifetime_value: e.target.value ? parseFloat(e.target.value) : null 
                      })}
                      placeholder="No limit"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min Services</Label>
                    <Input
                      type="number"
                      value={editingSegment.min_total_services || ""}
                      onChange={(e) => setEditingSegment({ 
                        ...editingSegment, 
                        min_total_services: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="Any"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Services</Label>
                    <Input
                      type="number"
                      value={editingSegment.max_total_services || ""}
                      onChange={(e) => setEditingSegment({ 
                        ...editingSegment, 
                        max_total_services: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="No limit"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Activity Rules */}
              <div className="space-y-4">
                <h4 className="font-medium">Activity Rules</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min Days Since Service</Label>
                    <Input
                      type="number"
                      value={editingSegment.min_days_since_service || ""}
                      onChange={(e) => setEditingSegment({ 
                        ...editingSegment, 
                        min_days_since_service: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="Any"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Days Since Service</Label>
                    <Input
                      type="number"
                      value={editingSegment.max_days_since_service || ""}
                      onChange={(e) => setEditingSegment({ 
                        ...editingSegment, 
                        max_days_since_service: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="No limit"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Automation Settings */}
              <div className="space-y-4">
                <h4 className="font-medium">Automation</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-assign customers</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically assign customers matching rules
                    </p>
                  </div>
                  <Switch
                    checked={editingSegment.is_auto !== false}
                    onCheckedChange={(checked) => setEditingSegment({ ...editingSegment, is_auto: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Auto Follow-up Days</Label>
                  <Input
                    type="number"
                    value={editingSegment.auto_follow_up_days || ""}
                    onChange={(e) => setEditingSegment({ 
                      ...editingSegment, 
                      auto_follow_up_days: e.target.value ? parseInt(e.target.value) : null 
                    })}
                    placeholder="Disabled"
                  />
                  <p className="text-xs text-muted-foreground">
                    Days after inactivity to trigger a follow-up email
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Active</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable this segment for assignment
                    </p>
                  </div>
                  <Switch
                    checked={editingSegment.is_active !== false}
                    onCheckedChange={(checked) => setEditingSegment({ ...editingSegment, is_active: checked })}
                  />
                </div>
              </div>

              <Separator />

              {/* Proximity Targeting */}
              <div className="space-y-3">
                <ProximityPicker
                  value={{
                    lat: editingSegment.geo_center_lat ?? null,
                    lng: editingSegment.geo_center_lng ?? null,
                    radiusMiles: editingSegment.geo_radius_miles ?? 0,
                  }}
                  onChange={(next) =>
                    setEditingSegment({
                      ...editingSegment,
                      geo_center_lat: next.lat,
                      geo_center_lng: next.lng,
                      geo_radius_miles: next.lat == null ? null : next.radiusMiles,
                    })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSegment} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isEditing ? "Save Changes" : "Create Segment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Segment Customers Dialog */}
      <Dialog open={!!viewSegment} onOpenChange={(open) => !open && setViewSegment(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewSegment && (
                <span
                  className="p-1.5 rounded"
                  style={{ backgroundColor: `${viewSegment.color}20`, color: viewSegment.color }}
                >
                  {getSegmentIcon(viewSegment.icon)}
                </span>
              )}
              {viewSegment?.name} — {viewCustomers.length} customer{viewCustomers.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Customers currently assigned to this segment, ordered by lifetime value.
            </DialogDescription>
          </DialogHeader>

          {viewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : viewCustomers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No customers in this segment yet.</p>
              <p className="text-xs mt-1">Try running "Recalculate All".</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium text-right">LTV</th>
                    <th className="px-3 py-2 font-medium text-right">Services</th>
                    <th className="px-3 py-2 font-medium">Last service</th>
                  </tr>
                </thead>
                <tbody>
                  {viewCustomers.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          {c.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {c.email}
                            </span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {c.phone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrency(c.lifetime_value || 0)}</td>
                      <td className="px-3 py-2 text-right">{c.total_services || 0}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.last_service_date ? new Date(c.last_service_date).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewSegment(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (viewSegment) {
                  sendCampaignToSegment(viewSegment);
                  setViewSegment(null);
                }
              }}
              disabled={!viewSegment || viewCustomers.length === 0}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Campaign to Segment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CustomerSegmentation;
