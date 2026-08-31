import { useState, useEffect } from "react";
import {
  fetchCatalogItems,
  fetchServiceCategories,
  type CatalogItem as ServiceCatalogItem,
  type ServiceCategory,
} from "@/application/queries";
import {
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  toggleCatalogItemActive,
  swapCatalogSortOrder,
} from "@/application/commands";
import { AppLayout } from "@/components/layout/AppLayout";
import { useTerminology } from "@/contexts/TerminologyContext";
import { bankersRound, formatMoney } from '@/lib/financialMath';
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Clock, DollarSign, Wrench, ArrowUp, ArrowDown, GripVertical, Gauge, Settings2, CarFront, Sparkles, CircleGauge } from "lucide-react";
import { getCategoryColor } from "@/lib/categoryColors";
import { SmartUpsellsCard } from "@/components/catalog/SmartUpsellsCard";
import { ServiceLibraryDialog } from "@/components/catalog/ServiceLibraryDialog";
import { CatalogBenchmarkDialog } from "@/components/pricing/CatalogBenchmarkDialog";
import { fetchCatalogBenchmarks, type CatalogBenchmark } from "@/application/queries/repair-pricing.query";
import { marketPosition } from "@/domain/pricing/repair-estimate";


const SERVICE_VERTICALS = [
  { value: "general", label: "General & Maintenance", description: "Repairs, oil, inspections, and standard services", icon: Wrench },
  { value: "detailing", label: "Detailing & Car Wash", description: "Wash, interior, exterior, ceramic, and detail services", icon: Sparkles },
  { value: "tires", label: "Tires & Wheels", description: "Replacement, rotation, repair, balancing, and TPMS", icon: CircleGauge },
] as const;

const PRICING_MODES = [
  { value: "flat", label: "Flat price" },
  { value: "labor_parts", label: "Labor + parts" },
  { value: "detailing_assessment", label: "Detailing assessment" },
  { value: "tire_inventory", label: "Tire inventory + installation" },
  { value: "quote_required", label: "Provider quote required" },
] as const;

const TIRE_INTENTS = [
  { value: "replacement", label: "Replacement / installation" },
  { value: "rotation", label: "Rotation" },
  { value: "repair", label: "Repair / patch" },
  { value: "balance", label: "Balancing" },
  { value: "tpms", label: "TPMS / sensor" },
  { value: "alignment", label: "Alignment" },
  { value: "wheel_service", label: "Wheel service" },
] as const;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unexpected error";

const SKILL_LEVELS = [
  { value: "basic", label: "Basic" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

const ServiceCatalog = () => {
  const { terms } = useTerminology();
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVertical, setSelectedVertical] = useState<"all" | "general" | "detailing" | "tires">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceCatalogItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    category_id: "",
    default_price: "",
    labor_rate: "",
    estimated_duration: "",
    skill_level: "",
    parts_required: "",
    notes: "",
    is_active: true,
    is_upsell: false,
    service_vertical: "general",
    pricing_mode: "flat",
    service_intent: "",
    requires_fitment_lookup: false,
    requires_inventory_selection: false,
    allows_manual_fitment: false,
  });
  const [benchmarks, setBenchmarks] = useState<Record<string, CatalogBenchmark>>({});
  const [benchmarkTarget, setBenchmarkTarget] = useState<ServiceCatalogItem | null>(null);

  const loadBenchmarks = async () => {
    setBenchmarks(await fetchCatalogBenchmarks());
  };

  const fetchServices = async () => {
    try {
      const data = await fetchCatalogItems();
      setServices(data);
    } catch (err: unknown) {
      toast({ title: "Error fetching services", description: errorMessage(err), variant: "destructive" });
    }
    setLoading(false);
  };


  const fetchCats = async () => {
    try {
      const data = await fetchServiceCategories();
      setCategories(data);
    } catch {
      // silent — categories are optional
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchServices());
    void Promise.resolve().then(() => fetchCats());
    void Promise.resolve().then(() => loadBenchmarks());
  }, []);


  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      category_id: "",
      default_price: "",
      labor_rate: "",
      estimated_duration: "",
      skill_level: "",
      parts_required: "",
      notes: "",
      is_active: true,
      is_upsell: false,
      service_vertical: "general",
      pricing_mode: "flat",
      service_intent: "",
      requires_fitment_lookup: false,
      requires_inventory_selection: false,
      allows_manual_fitment: false,
    });
    setEditingService(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const serviceData = {
      name: formData.name,
      description: formData.description || null,
      category_id: formData.category_id || null,
      category: categories.find((category) => category.id === formData.category_id)?.name || null,
      default_price: bankersRound(Number(formData.default_price) || 0, 2),
      labor_rate: formData.labor_rate
        ? bankersRound(Number(formData.labor_rate) || 0, 2) : null,
      estimated_duration: formData.estimated_duration ? parseInt(formData.estimated_duration) : null,
      skill_level: formData.skill_level || null,
      parts_required: formData.parts_required || null,
      notes: formData.notes || null,
      is_active: formData.is_active,
        is_upsell: formData.is_upsell,
        service_vertical: formData.service_vertical,
        pricing_mode: formData.pricing_mode,
        service_intent: formData.service_vertical === "tires" ? formData.service_intent || null : null,
        requires_fitment_lookup: formData.service_vertical === "tires" && formData.requires_fitment_lookup,
        requires_inventory_selection: formData.service_vertical === "tires" && formData.requires_inventory_selection,
        allows_manual_fitment: formData.service_vertical === "tires" && formData.allows_manual_fitment,
      };

    try {
      if (editingService) {
        await updateCatalogItem(editingService.id, serviceData);
        toast({ title: "Service updated successfully" });
      } else {
        await createCatalogItem(serviceData);
        toast({ title: "Service created successfully" });
      }
      fetchServices();
      setDialogOpen(false);
      resetForm();
    } catch (err: unknown) {
      toast({ title: `Error ${editingService ? "updating" : "creating"} service`, description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleEdit = (service: ServiceCatalogItem) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      category: service.category || "",
      category_id: service.category_id || categories.find((category) => category.name === service.category)?.id || "",
      default_price: service.default_price.toString(),
      labor_rate: service.labor_rate?.toString() || "",
      estimated_duration: service.estimated_duration?.toString() || "",
      skill_level: service.skill_level || "",
      parts_required: service.parts_required || "",
      notes: service.notes || "",
      is_active: service.is_active,
      is_upsell: service.is_upsell,
      service_vertical: service.service_vertical || "general",
      pricing_mode: service.pricing_mode || "flat",
      service_intent: service.service_intent || "",
      requires_fitment_lookup: service.requires_fitment_lookup ?? false,
      requires_inventory_selection: service.requires_inventory_selection ?? service.requires_tire_quantity ?? false,
      allows_manual_fitment: service.allows_manual_fitment ?? false,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCatalogItem(id);
      toast({ title: "Service deleted successfully" });
      fetchServices();
    } catch (err: unknown) {
      toast({ title: "Error deleting service", description: errorMessage(err), variant: "destructive" });
    }
  };

  const toggleActive = async (service: ServiceCatalogItem) => {
    try {
      await toggleCatalogItemActive(service.id, service.is_active);
      fetchServices();
    } catch (err: unknown) {
      toast({ title: "Error updating service", description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleMoveUp = async (service: ServiceCatalogItem, index: number) => {
    if (index === 0) return;
    const prevService = filteredServices[index - 1];
    try {
      await swapCatalogSortOrder(service.id, service.sort_order, prevService.id, prevService.sort_order);
      await fetchServices();
      toast({ title: "Order updated" });
    } catch {
      toast({ title: "Error reordering", variant: "destructive" });
    }
  };

  const handleMoveDown = async (service: ServiceCatalogItem, index: number) => {
    if (index === filteredServices.length - 1) return;
    const nextService = filteredServices[index + 1];
    try {
      await swapCatalogSortOrder(service.id, service.sort_order, nextService.id, nextService.sort_order);
      await fetchServices();
      toast({ title: "Order updated" });
    } catch {
      toast({ title: "Error reordering", variant: "destructive" });
    }
  };

  // Main service list excludes add-ons (is_upsell=true). Add-ons are managed
  // exclusively in the Smart Upsells card at the top of the page.
  const mainServices = services.filter((s) => !s.is_upsell);
  const addonCount = services.length - mainServices.length;

  const filteredServices = mainServices.filter(
    (s) =>
      (selectedVertical === "all" || (s.service_vertical || "general") === selectedVertical) &&
      (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeServices = mainServices.filter((s) => s.is_active).length;
  const uniqueCategories = [...new Set(mainServices.map((s) => s.category).filter(Boolean))];

  const getSkillBadgeVariant = (skill: string | null) => {
    switch (skill) {
      case "beginner": return "secondary";
      case "intermediate": return "default";
      case "advanced": return "outline";
      case "expert": return "destructive";
      default: return "secondary";
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "-";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <AppLayout title={`${terms.service} Catalog`}>
      {/* Smart Upsells Manager */}
      <SmartUpsellsCard onRefresh={fetchServices} />

      {(mainServices.some((service) => service.service_vertical === "detailing") ||
        mainServices.some((service) => service.service_vertical === "tires")) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {mainServices.some((service) => service.service_vertical === "detailing") && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/detailing-pricing">Detailing pricing</Link>
            </Button>
          )}
          {mainServices.some((service) => service.service_vertical === "tires") && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/tire-pricing">Tire pricing</Link>
            </Button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Services</p>
              <p className="text-2xl font-bold">{mainServices.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 bg-gray-500/10 rounded-xl">
              <DollarSign className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Services</p>
              <p className="text-2xl font-bold">{activeServices}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Categories</p>
              <p className="text-2xl font-bold">{uniqueCategories.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <Plus className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Add-ons</p>
              <p className="text-2xl font-bold">{addonCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {SERVICE_VERTICALS.map((vertical) => {
          const Icon = vertical.icon;
          const count = mainServices.filter((service) => (service.service_vertical || "general") === vertical.value).length;
          const active = selectedVertical === vertical.value;
          return (
            <button key={vertical.value} type="button" onClick={() => setSelectedVertical(vertical.value)} className={`rounded-xl border p-4 text-left transition-colors ${active ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}>
              <div className="flex items-start justify-between gap-3"><div className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4" /></div><Badge variant={active ? "default" : "secondary"}>{count}</Badge></div>
              <p className="mt-3 font-semibold">{vertical.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{vertical.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${selectedVertical === "all" ? "services" : SERVICE_VERTICALS.find((vertical) => vertical.value === selectedVertical)?.label.toLowerCase() || "services"}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <ServiceLibraryDialog
            adoptedTemplateIds={services.map((service) => service.template_id).filter((id): id is string => Boolean(id))}
            onAdopted={fetchServices}
          />
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
          <Button onClick={() => {
                  resetForm();
                  if (selectedVertical !== "all") setFormData((current) => ({ ...current, service_vertical: selectedVertical }));
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add {terms.service}
                </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingService ? "Edit" : "Add"} {terms.service}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Oil Change"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category_id} onValueChange={(v) => setFormData({ ...formData, category_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                <div className="flex items-start gap-3"><Settings2 className="h-5 w-5 mt-0.5 text-primary" /><div><p className="font-semibold">Service behavior</p><p className="text-xs text-muted-foreground">These settings control what customers see during public booking.</p></div></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Service vertical</Label><Select value={formData.service_vertical} onValueChange={(value) => setFormData({ ...formData, service_vertical: value as typeof formData.service_vertical, service_intent: value === "tires" ? formData.service_intent : "", pricing_mode: value === "detailing" ? "detailing_assessment" : value === "tires" ? "tire_inventory" : formData.pricing_mode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SERVICE_VERTICALS.map((vertical) => <SelectItem key={vertical.value} value={vertical.value}>{vertical.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Pricing mode</Label><Select value={formData.pricing_mode} onValueChange={(value) => setFormData({ ...formData, pricing_mode: value as typeof formData.pricing_mode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRICING_MODES.map((mode) => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}</SelectContent></Select></div>
                </div>
                {formData.service_vertical === "tires" && <div className="space-y-4 rounded-lg border bg-background p-3"><div className="flex items-center gap-2 text-sm font-medium"><CarFront className="h-4 w-4 text-primary" />Tire service behavior</div><div className="space-y-2"><Label>Tire service intent</Label><Select value={formData.service_intent} onValueChange={(value) => setFormData({ ...formData, service_intent: value })}><SelectTrigger><SelectValue placeholder="Choose the tire work" /></SelectTrigger><SelectContent>{TIRE_INTENTS.map((intent) => <SelectItem key={intent.value} value={intent.value}>{intent.label}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><label className="flex items-center gap-2 text-sm"><Checkbox checked={formData.requires_fitment_lookup} onCheckedChange={(checked) => setFormData({ ...formData, requires_fitment_lookup: checked === true })} />Fitment lookup</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={formData.requires_inventory_selection} onCheckedChange={(checked) => setFormData({ ...formData, requires_inventory_selection: checked === true })} />Inventory selection</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={formData.allows_manual_fitment} onCheckedChange={(checked) => setFormData({ ...formData, allows_manual_fitment: checked === true })} />Allow manual fitment</label></div><p className="text-xs text-muted-foreground">Use inventory selection for replacement/installation services. Rotation, repair, and balancing can use fitment without requiring a tire product.</p></div>}
                {formData.service_vertical === "detailing" && <div className="rounded-lg border bg-background p-3 text-sm"><div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-primary" />Detailing assessment enabled</div><p className="mt-1 text-xs text-muted-foreground">The detailing pricing workspace will apply vehicle-size and condition rules to this service. Use provider review when the final price depends on photos or site conditions.</p></div>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the service"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default_price">Default Price ($) *</Label>
                  <Input
                    id="default_price"
                    type="number"
                    step="0.01"
                    value={formData.default_price}
                    onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="labor_rate">Labor Rate ($/hr)</Label>
                  <Input
                    id="labor_rate"
                    type="number"
                    step="0.01"
                    value={formData.labor_rate}
                    onChange={(e) => setFormData({ ...formData, labor_rate: e.target.value })}
                    placeholder="Optional — leave blank for flat-rate services"
                  />
                  <p className="text-xs text-muted-foreground">Only set for services that charge hourly labor</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimated_duration">Duration (min)</Label>
                  <Input
                    id="estimated_duration"
                    type="number"
                    value={formData.estimated_duration}
                    onChange={(e) => setFormData({ ...formData, estimated_duration: e.target.value })}
                    placeholder="60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="skill_level">Skill Level</Label>
                  <Select value={formData.skill_level} onValueChange={(v) => setFormData({ ...formData, skill_level: v === "__none__" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select skill level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {SKILL_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parts_required">Parts Required</Label>
                  <Input
                    id="parts_required"
                    value={formData.parts_required}
                    onChange={(e) => setFormData({ ...formData, parts_required: e.target.value })}
                    placeholder="e.g., Oil filter, 5W-30 oil"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes or instructions"
                  rows={2}
                />
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active (available for selection)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_upsell"
                    checked={formData.is_upsell}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_upsell: checked })}
                  />
                  <Label htmlFor="is_upsell">Smart Upsell (recommend as add-on during checkout)</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit">{editingService ? "Update" : "Create"} {terms.service}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{terms.service} List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : filteredServices.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchQuery ? "No services found matching your search" : "No services yet. Add your first service to get started."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Order</TableHead>
                    <TableHead>Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Behavior</TableHead>
                          <TableHead>Price</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Skill</TableHead>
                    
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredServices.map((service, index) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => handleMoveUp(service, index)}
                              disabled={index === 0 || !!searchQuery}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => handleMoveDown(service, index)}
                              disabled={index === filteredServices.length - 1 || !!searchQuery}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{service.name}</p>
                          {service.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-xs">{service.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {service.category ? (
                          <Badge
                            className={getCategoryColor(service.category)}
                          >
                            {service.category}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell><div className="flex flex-wrap gap-1"><Badge variant="outline" className="capitalize">{(service.service_vertical || "general") === "tires" ? "Tires & Wheels" : (service.service_vertical || "general") === "detailing" ? "Detailing" : "General"}</Badge>{service.service_vertical === "tires" && service.requires_inventory_selection && <Badge variant="secondary">Inventory</Badge>}{service.service_vertical === "tires" && service.requires_fitment_lookup && <Badge variant="secondary">Fitment</Badge>}{service.service_vertical === "detailing" && <Badge variant="secondary">Assessment</Badge>}</div></TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span>${formatMoney(service.default_price)}</span>
                          {(() => {
                            const bench = benchmarks[service.id];
                            if (!bench) return null;
                            const pos = marketPosition(service.default_price, bench.independent_avg);
                            if (!pos) return null;
                            return (
                              <Badge
                                variant="outline"
                                className="w-fit text-[10px] font-medium"
                                title={`Market avg $${formatMoney(bench.independent_avg)} (${bench.repair_title})`}
                              >
                                {pos.label === "at"
                                  ? "At market"
                                  : `${Math.abs(pos.percent)}% ${pos.label} market`}
                              </Badge>
                            );
                          })()}
                        </div>
                      </TableCell>

                      <TableCell>{formatDuration(service.estimated_duration)}</TableCell>
                      <TableCell>
                        {service.skill_level ? (
                          <Badge variant={getSkillBadgeVariant(service.skill_level)}>
                            {service.skill_level}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={service.is_active}
                          onCheckedChange={() => toggleActive(service)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Benchmark against market pricing"
                            onClick={() => setBenchmarkTarget(service)}
                          >
                            <Gauge className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(service)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(service.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {benchmarkTarget && (
        <CatalogBenchmarkDialog
          open={!!benchmarkTarget}
          onOpenChange={(open) => !open && setBenchmarkTarget(null)}
          serviceCatalogId={benchmarkTarget.id}
          serviceName={benchmarkTarget.name}
          shopPrice={benchmarkTarget.default_price}
          onSaved={loadBenchmarks}
        />
      )}
    </AppLayout>

  );
};

export default ServiceCatalog;
