import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  fetchPackages as fetchPackagesQuery,
  fetchPackageServiceCatalog,
  type ServicePackageRow,
  type PackageServiceItem as ServiceCatalogItem,
} from "@/application/queries";
import {
  createServicePackage,
  updateServicePackage,
  deleteServicePackage as deletePackageCmd,
  toggleServicePackageActive,
  loadTemplatePackages,
} from "@/application/commands";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, PackageCheck, Search, X, Clock, Percent, Download, Loader2 } from "lucide-react";
import { formatDollarsAsCurrency } from "@/lib/financialMath";

// Types re-exported from queries layer - no local duplication needed

interface PackageItem {
  id?: string;
  service_catalog_id: string;
  quantity: number;
  override_price: number | null;
  service?: ServiceCatalogItem;
}

interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  package_price: number;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  estimated_duration: number | null;
  items: PackageItem[];
}

const ServicePackages = () => {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [packageSearchQuery, setPackageSearchQuery] = useState("");
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [editingPackage, setEditingPackage] = useState<ServicePackage | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    discount_type: "fixed",
    discount_value: 0,
    is_active: true,
  });
  const [selectedItems, setSelectedItems] = useState<PackageItem[]>([]);

  const fetchPackages = useCallback(async () => {
    try {
      const data = await fetchPackagesQuery();
      setPackages(data as unknown as ServicePackage[]);
    } catch (error) {
      console.error("Error fetching packages:", error);
      toast.error("Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const data = await fetchPackageServiceCatalog();
      setServices(data);
    } catch (error) {
      console.error("Error fetching services:", error);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
    fetchServices();
  }, [fetchPackages, fetchServices]);

  const loadPreConfiguredPackages = async () => {
    setLoadingTemplates(true);
    try {
      const count = await loadTemplatePackages();
      if (count === 0) {
        toast.info("All template packages already exist in your catalog");
      } else {
        toast.success(`Added ${count} pre-configured package${count > 1 ? 's' : ''} to your catalog`);
        fetchPackages();
      }
    } catch (error: any) {
      console.error("Error loading templates:", error);
      toast.error(error.message || "Failed to load pre-configured packages");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const calculateOriginalPrice = () => {
    return selectedItems.reduce((sum, item) => {
      const price = item.override_price ?? item.service?.default_price ?? 0;
      return sum + price * item.quantity;
    }, 0);
  };

  const calculatePackagePrice = () => {
    const original = calculateOriginalPrice();
    if (formData.discount_type === "percentage") {
      return original * (1 - formData.discount_value / 100);
    }
    return Math.max(0, original - formData.discount_value);
  };

  const calculateTotalDuration = () => {
    return selectedItems.reduce((sum, item) => {
      return sum + (item.service?.estimated_duration || 0) * item.quantity;
    }, 0);
  };

  const handleAddService = (service: ServiceCatalogItem) => {
    const existing = selectedItems.find((i) => i.service_catalog_id === service.id);
    if (existing) {
      setSelectedItems(
        selectedItems.map((i) =>
          i.service_catalog_id === service.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setSelectedItems([
        ...selectedItems,
        {
          service_catalog_id: service.id,
          quantity: 1,
          override_price: null,
          service,
        },
      ]);
    }
  };

  const handleRemoveService = (serviceId: string) => {
    setSelectedItems(selectedItems.filter((i) => i.service_catalog_id !== serviceId));
  };

  const handleUpdateQuantity = (serviceId: string, quantity: number) => {
    if (quantity < 1) return;
    setSelectedItems(
      selectedItems.map((i) =>
        i.service_catalog_id === serviceId ? { ...i, quantity } : i
      )
    );
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      discount_type: "fixed",
      discount_value: 0,
      is_active: true,
    });
    setSelectedItems([]);
    setServiceSearchQuery("");
    setEditingPackage(null);
  };

  const handleEdit = (pkg: ServicePackage) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      description: pkg.description || "",
      discount_type: pkg.discount_type,
      discount_value: pkg.discount_value,
      is_active: pkg.is_active,
    });
    setSelectedItems(pkg.items);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Package name is required");
      return;
    }

    if (selectedItems.length === 0) {
      toast.error("Add at least one service to the package");
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        package_price: calculatePackagePrice(),
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        is_active: formData.is_active,
        estimated_duration: calculateTotalDuration() || null,
      };

      const items = selectedItems.map((item) => ({
        service_catalog_id: item.service_catalog_id,
        quantity: item.quantity,
        override_price: item.override_price,
      }));

      if (editingPackage) {
        await updateServicePackage(editingPackage.id, payload, items);
        toast.success("Package updated successfully");
      } else {
        await createServicePackage(payload, items);
        toast.success("Package created successfully");
      }

      setDialogOpen(false);
      resetForm();
      fetchPackages();
    } catch (error) {
      console.error("Error saving package:", error);
      toast.error("Failed to save package");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this package?")) return;

    try {
      await deletePackageCmd(id);
      toast.success("Package deleted");
      fetchPackages();
    } catch (error) {
      console.error("Error deleting package:", error);
      toast.error("Failed to delete package");
    }
  };

  const toggleActive = async (pkg: ServicePackage) => {
    try {
      await toggleServicePackageActive(pkg.id, !pkg.is_active);
      toast.success(pkg.is_active ? "Package deactivated" : "Package activated");
      fetchPackages();
    } catch (error) {
      console.error("Error toggling package:", error);
      toast.error("Failed to update package");
    }
  };

  const filteredPackages = packages.filter(
    (pkg) =>
      pkg.name.toLowerCase().includes(packageSearchQuery.toLowerCase()) ||
      pkg.description?.toLowerCase().includes(packageSearchQuery.toLowerCase())
  );

  const filteredServices = services.filter(
    (service) =>
      !selectedItems.some((i) => i.service_catalog_id === service.id) &&
      service.name.toLowerCase().includes(serviceSearchQuery.toLowerCase())
  );

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  return (
    <AppLayout title="Service Packages">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Service Packages</h1>
            <p className="text-muted-foreground">
              Bundle services together with discounted pricing
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={loadPreConfiguredPackages}
              disabled={loadingTemplates}
            >
              {loadingTemplates ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Load Templates
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Package
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingPackage ? "Edit Package" : "Create Service Package"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Package Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Full Service Package"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <div className="flex items-center space-x-2 pt-2">
                      <Switch
                        checked={formData.is_active}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, is_active: checked })
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        {formData.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe what's included in this package"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Discount Type</Label>
                    <Select
                      value={formData.discount_type}
                      onValueChange={(value) =>
                        setFormData({ ...formData, discount_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discount_value">
                      Discount {formData.discount_type === "percentage" ? "%" : "Amount"}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {formData.discount_type === "percentage" ? "%" : "$"}
                      </span>
                      <Input
                        id="discount_value"
                        type="number"
                        min="0"
                        step={formData.discount_type === "percentage" ? "1" : "0.01"}
                        max={formData.discount_type === "percentage" ? "100" : undefined}
                        value={formData.discount_value}
                        onChange={(e) =>
                          setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })
                        }
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>

                {/* Services Selection */}
                <div className="space-y-4">
                  <Label>Services in Package</Label>
                  
                  {/* Selected Services */}
                  {selectedItems.length > 0 && (
                    <div className="border rounded-lg divide-y">
                      {selectedItems.map((item) => (
                        <div
                          key={item.service_catalog_id}
                          className="flex items-center justify-between p-3 gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.service?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatDollarsAsCurrency(item.service?.default_price || 0)} each
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdateQuantity(item.service_catalog_id, item.quantity - 1)}
                              aria-label={`Remove one ${item.service?.name ?? "service"}`}
                              title={`Remove one ${item.service?.name ?? "service"}`}
                            >
                              -
                            </Button>
                            <span className="w-8 text-center">{item.quantity}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdateQuantity(item.service_catalog_id, item.quantity + 1)}
                              aria-label={`Add one ${item.service?.name ?? "service"}`}
                              title={`Add one ${item.service?.name ?? "service"}`}
                            >
                              +
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleRemoveService(item.service_catalog_id)}
                              aria-label={`Remove ${item.service?.name ?? "service"} from package`}
                              title={`Remove ${item.service?.name ?? "service"} from package`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Services */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search services to add..."
                        value={serviceSearchQuery}
                        onChange={(e) => setServiceSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {serviceSearchQuery && filteredServices.length > 0 && (
                      <div className="border rounded-lg max-h-40 overflow-y-auto divide-y">
                        {filteredServices.slice(0, 5).map((service) => (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => {
                              handleAddService(service);
                              setServiceSearchQuery("");
                            }}
                            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 text-left"
                          >
                            <div>
                              <p className="font-medium">{service.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {service.category || "Uncategorized"}
                              </p>
                            </div>
                            <span className="text-sm font-medium">
                              {formatDollarsAsCurrency(service.default_price)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pricing Summary */}
                {selectedItems.length > 0 && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Original Price:</span>
                          <span className="line-through">{formatDollarsAsCurrency(calculateOriginalPrice())}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Discount ({formData.discount_type === "percentage" 
                              ? `${formData.discount_value}%` 
                              : formatDollarsAsCurrency(formData.discount_value)}):
                          </span>
                          <span className="text-gray-600">
                            -{formatDollarsAsCurrency(calculateOriginalPrice() - calculatePackagePrice())}
                          </span>
                        </div>
                        <div className="flex justify-between font-bold text-lg pt-2 border-t">
                          <span>Package Price:</span>
                          <span className="text-primary">{formatDollarsAsCurrency(calculatePackagePrice())}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Estimated Duration:</span>
                          <span>{formatDuration(calculateTotalDuration())}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingPackage ? "Update Package" : "Create Package"}
                  </Button>
                </div>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Packages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" aria-hidden="true" />
                {loading ? <Skeleton className="h-8 w-10" aria-label="Loading total packages" /> : <span className="text-2xl font-bold">{packages.length}</span>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Packages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                {loading ? <Skeleton className="h-8 w-10" aria-label="Loading active packages" /> : (
                  <span className="text-2xl font-bold">
                    {packages.filter((p) => p.is_active).length}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Savings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-blue-500" aria-hidden="true" />
                {loading ? <Skeleton className="h-8 w-14" aria-label="Loading average savings" /> : (
                  <span className="text-2xl font-bold">
                    {packages.length > 0
                      ? Math.round(
                          packages.reduce((sum, p) => {
                            const original = p.items.reduce(
                              (s, i) => s + (i.service?.default_price || 0) * i.quantity,
                              0
                            );
                            return sum + (original > 0 ? ((original - p.package_price) / original) * 100 : 0);
                          }, 0) / packages.length
                        )
                      : 0}
                    %
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search packages..."
            value={packageSearchQuery}
            onChange={(e) => setPackageSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Packages Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6" aria-label="Loading service packages">
                      <div className="space-y-3" role="status" aria-live="polite">
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-11/12" />
                        <Skeleton className="h-5 w-10/12" />
                        <span className="sr-only">Loading service packages</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredPackages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {packages.length === 0
                        ? "No packages yet. Create your first package!"
                        : "No packages match your search."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPackages.map((pkg) => {
                    const originalPrice = pkg.items.reduce(
                      (sum, i) => sum + (i.service?.default_price || 0) * i.quantity,
                      0
                    );
                    const savings = originalPrice - pkg.package_price;
                    
                    return (
                      <TableRow key={pkg.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{pkg.name}</p>
                            {pkg.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {pkg.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {pkg.items.slice(0, 3).map((item) => (
                              <Badge key={item.service_catalog_id} variant="secondary" className="text-xs">
                                {item.service?.name}
                                {item.quantity > 1 && ` x${item.quantity}`}
                              </Badge>
                            ))}
                            {pkg.items.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{pkg.items.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{formatDollarsAsCurrency(pkg.package_price)}</p>
                            {savings > 0 && (
                              <p className="text-xs text-gray-600">
                                Save {formatDollarsAsCurrency(savings)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {formatDuration(pkg.estimated_duration)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={pkg.is_active}
                            onCheckedChange={() => toggleActive(pkg)}
                            aria-label={`${pkg.is_active ? "Deactivate" : "Activate"} ${pkg.name}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(pkg)}
                              aria-label={`Edit ${pkg.name}`}
                              title={`Edit ${pkg.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDelete(pkg.id)}
                              aria-label={`Delete ${pkg.name}`}
                              title={`Delete ${pkg.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ServicePackages;
