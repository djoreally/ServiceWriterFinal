import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Users, Car, Edit, Trash2, Eye, Upload, Download } from "lucide-react";
import { ClickablePhone, ClickableEmail } from "@/components/ui/clickable-contact";
import { toast } from "@/components/ui/sonner";
import { useTerminology } from "@/contexts/TerminologyContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { customerSchema, getFirstError } from "@/lib/validation";
import { useDebounce } from "@/hooks/useDebounce";
import { ImportDialog, FieldMapping } from "@/components/import/ImportDialog";
import { customerFieldMappings, vehicleFieldMappings } from "@/lib/importParser";
import { useCustomerImport } from "@/hooks/useDataImport";
import { formatDateLabel } from "@/lib/datetime";
import { fetchCustomerOverview } from "@/application/queries";
import { createCustomer, updateCustomer, deleteCustomer } from "@/application/commands";
import { fetchCustomerOverviewFromNextApi } from "@/application/queries/customers.query";
import { useWorkspaceSelection } from "@/hooks/useWorkspaceSelection";
import { ListPagination, usePageSlice, DEFAULT_PAGE_SIZE } from "@/components/ui/list-pagination";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  notes?: string | null;
}

// Combined field mappings for customer + vehicle import
const combinedFieldMappings = { ...customerFieldMappings, ...vehicleFieldMappings };

const customerImportFields: FieldMapping[] = [
  { field: 'name', label: 'Customer Name', required: true },
  { field: 'email', label: 'Email' },
  { field: 'phone', label: 'Phone' },
  { field: 'address', label: 'Address' },
  { field: 'notes', label: 'Notes' },
  { field: 'make', label: 'Vehicle Make' },
  { field: 'model', label: 'Vehicle Model' },
  { field: 'year', label: 'Vehicle Year' },
  { field: 'vin', label: 'VIN' },
  { field: 'license_plate', label: 'License Plate' },
  { field: 'color', label: 'Vehicle Color' },
  { field: 'mileage', label: 'Mileage' },
];

const Customers = () => {
  const navigate = useNavigate();
  const { terms } = useTerminology();
  const { selectedWorkspaceId, loading: workspaceLoading } = useWorkspaceSelection();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [vehicleCounts, setVehicleCounts] = useState<Record<string, number>>({});
  const [lastServiceDates, setLastServiceDates] = useState<Record<string, string>>({});
  const [customersLoading, setCustomersLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  const { importCustomers } = useCustomerImport();

  // Export customers as CSV
  const handleExport = () => {
    if (!customers.length) return;
    const headers = ["Name", "Email", "Phone", "Address", "Notes"];
    const rows = customers.map(c => [c.name, c.email || "", c.phone || "", c.address || "", c.notes || ""]);
    const csv = [headers.join(","), ...rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchCustomers = useCallback(async () => {
    setCustomersLoading(true); setVehiclesLoading(true); setServicesLoading(true);
    setCustomersError(null); setVehiclesError(null); setServicesError(null);

    try {
      // The customer directory is the source of truth for the active workspace.
      // Rendering an offline snapshot here can mix an old/demo cache with the
      // signed-in account while the canonical request is still in flight.
      const overview = selectedWorkspaceId
        ? await fetchCustomerOverviewFromNextApi(selectedWorkspaceId)
        : await fetchCustomerOverview();
      const { customers, vehicleCounts, lastServiceDates } = overview;
      setCustomers(customers);
      setVehicleCounts(vehicleCounts);
      setLastServiceDates(lastServiceDates);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch customers";
      setCustomersError(message);
      toast.error(message);
    } finally {
      setCustomersLoading(false);
      setVehiclesLoading(false);
      setServicesLoading(false);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!workspaceLoading) void Promise.resolve().then(() => fetchCustomers());
  }, [fetchCustomers, workspaceLoading]);

  const { containerRef, isRefreshing } = usePullToRefresh({
    onRefresh: fetchCustomers,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form data
    const validationResult = customerSchema.safeParse(formData);
    if (!validationResult.success) {
      toast.error(getFirstError(validationResult) || "Validation error");
      return;
    }

    const validatedData = {
      name: validationResult.data.name,
      email: validationResult.data.email || null,
      phone: validationResult.data.phone || null,
      address: validationResult.data.address || null,
      notes: validationResult.data.notes || null,
    };

    if (editingCustomer) {
      try {
        await updateCustomer(editingCustomer.id, validatedData);
        toast.success("Customer updated successfully");
        setOpen(false);
        resetForm();
        fetchCustomers();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update customer";
        toast.error(message);
      }
    } else {
      try {
        await createCustomer(validatedData);
        toast.success("Customer created successfully");
        setOpen(false);
        resetForm();
        fetchCustomers();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create customer";
        toast.error(message);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    try {
      await deleteCustomer(id);
      toast.success("Customer deleted successfully");
      fetchCustomers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete customer";
      toast.error(message);
    }
  };

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", address: "", notes: "" });
    setEditingCustomer(null);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
    setOpen(true);
  };

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  // ⚡ Performance: Debounce search input to avoid re-filtering on every keystroke
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Perf: avoid re-filtering the full customer list on unrelated state changes (dialog open/close, counts, etc.).
  const filteredCustomers = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(debouncedSearchQuery)
    );
  }, [customers, debouncedSearchQuery]);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  useEffect(() => { void Promise.resolve().then(() => setPage(1)); }, [debouncedSearchQuery, pageSize]);
  const pagedCustomers = usePageSlice(filteredCustomers, page, pageSize);

  return (
    <AppLayout title={`${terms.customer}s`}>
      <PullToRefreshContainer
        containerRef={containerRef}
        isRefreshing={isRefreshing}
      >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">All {terms.customer}s</h2>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your {terms.customer.toLowerCase()} base, {terms.vehicle.toLowerCase()}s, and {terms.service.toLowerCase()} history.</p>
          </div>
          <div className="flex gap-2 flex-col sm:flex-row">
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Add New {terms.customer}
                </Button>
              </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCustomer ? `Edit ${terms.customer}` : `Add New ${terms.customer}`}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit">{editingCustomer ? "Update" : "Create"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:max-w-xl">
          <StatCard title={`Total ${terms.customer}s`} value={customers.length} icon={Users} iconBgColor="bg-primary/10" iconColor="text-primary" />
          <StatCard title={`Active ${terms.vehicle}s`} value={Object.values(vehicleCounts).reduce((a, b) => a + b, 0)} icon={Car} iconBgColor="bg-gray-500/10" iconColor="text-gray-600" />
        </div>

        {/* Search */}
        <Card density="compact" className="rounded-b-none border-border/50">
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  density="compact"
                  placeholder="Search by name, phone, or email"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card density="compact" className="-mt-4 rounded-t-none border-border/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="font-medium">{terms.customer.toUpperCase()}</TableHead>
                  <TableHead className="font-medium">PHONE</TableHead>
                  <TableHead className="font-medium">{terms.vehicle.toUpperCase()}S</TableHead>
                  <TableHead className="font-medium">LAST {terms.service.toUpperCase()}</TableHead>
                  <TableHead className="font-medium">STATUS</TableHead>
                  <TableHead className="font-medium w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customersLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <TableRow key={`skeleton-${idx}`}>
                      <TableCell colSpan={6} className="py-4">
                        <Skeleton className="h-12 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : customersError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-destructive/5 py-4 text-center text-destructive">{customersError}</TableCell>
                  </TableRow>
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8">
                      <div className="flex flex-col items-center gap-4 py-8 text-center">
                        <div className="rounded-md bg-muted p-6 text-4xl">👥</div>
                        <h3 className="font-semibold">No {terms.customer.toLowerCase()}s yet</h3>
                        <p className="text-muted-foreground text-sm max-w-xs">
                          Add your first {terms.customer.toLowerCase()} to start tracking service history and activity.
                        </p>
                        <Button onClick={() => setOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" /> New {terms.customer}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedCustomers.map((customer) => (
                    <TableRow key={customer.id} className="border-border/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {getInitials(customer.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            {customer.email && <ClickableEmail email={customer.email} showIcon={false} className="text-sm" />}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {customer.phone ? (
                          <ClickablePhone phone={customer.phone} showIcon={false} />
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {vehicleCounts[customer.id] || 0} {terms.vehicle}{(vehicleCounts[customer.id] || 0) !== 1 ? "s" : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lastServiceDates[customer.id]
                          ? formatDateLabel(lastServiceDates[customer.id], "MMM dd, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Active</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="iconXs" onClick={() => navigate(`/customers/${customer.id}`)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="iconXs" onClick={() => openEditDialog(customer)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="iconXs" onClick={() => handleDelete(customer.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            <ListPagination
              totalCount={filteredCustomers.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel={`${terms.customer.toLowerCase()}s`}
            />
          </CardContent>
        </Card>
      </div>
      </PullToRefreshContainer>

      {/* Import Dialog */}
      <ImportDialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) fetchCustomers();
        }}
        title={`Import ${terms.customer}s`}
        description={`Upload a CSV or Excel file to import ${terms.customer.toLowerCase()}s and their ${terms.vehicle.toLowerCase()}s.`}
        fieldMappings={combinedFieldMappings}
        fields={customerImportFields}
        onImport={importCustomers}
      />
    </AppLayout>
  );
};

export default Customers;
