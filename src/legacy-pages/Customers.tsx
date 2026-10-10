import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  SearchX,
  Users,
  Edit,
  Trash2,
  Eye,
  Upload,
  Download,
  X,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { ClickablePhone, ClickableEmail } from "@/components/ui/clickable-contact";
import { toast } from "@/components/ui/sonner";
import { useTerminology } from "@/contexts/TerminologyContext";
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

/**
 * Row-level actions collapsed into a single overflow menu so the list
 * stays scannable — view, edit, and delete without three icons per row.
 */
function CustomerRowActions({
  customer,
  onView,
  onEdit,
  onDelete,
}: {
  customer: Customer;
  onView: (id: string) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="iconXs" aria-label={`Actions for ${customer.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onView(customer.id)}>
          <Eye className="mr-2 h-4 w-4" />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(customer)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(customer.id)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CustomersErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <h3 className="text-lg font-semibold text-foreground">Couldn't load customers</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}

function CustomersEmptyState({
  searching,
  query,
  customerNoun,
  vehicleNoun,
  onClearSearch,
  onAdd,
}: {
  searching: boolean;
  query: string;
  customerNoun: string;
  vehicleNoun: string;
  onClearSearch: () => void;
  onAdd: () => void;
}) {
  if (searching) {
    return (
      <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
        <div className="rounded-full bg-muted p-4">
          <SearchX className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-2 text-lg font-semibold text-foreground">No {customerNoun.toLowerCase()}s found</h3>
        <p className="max-w-xs text-sm text-muted-foreground">
          Nothing matches &ldquo;{query}&rdquo;. Check the spelling or try a phone number.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <div className="rounded-full bg-muted p-4">
        <Users className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-2 text-lg font-semibold text-foreground">No {customerNoun.toLowerCase()}s yet</h3>
      <p className="max-w-xs text-sm text-muted-foreground">
        Add your first {customerNoun.toLowerCase()} to start tracking {vehicleNoun.toLowerCase()}s and service history.
      </p>
      <Button size="sm" className="mt-3 gap-2" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        New {customerNoun}
      </Button>
    </div>
  );
}

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
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Press "/" anywhere on this screen to jump to search.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  // Slim KPI strip data — derived from the same overview fetch, no extra queries.
  const totalVehicles = useMemo(
    () => Object.values(vehicleCounts).reduce((a, b) => a + b, 0),
    [vehicleCounts]
  );
  const servicedCount = Object.keys(lastServiceDates).length;

  const vehicleLabel = (customerId: string) => {
    const count = vehicleCounts[customerId] || 0;
    return `${count} ${terms.vehicle}${count !== 1 ? "s" : ""}`;
  };
  const lastServiceLabel = (customerId: string) =>
    lastServiceDates[customerId]
      ? formatDateLabel(lastServiceDates[customerId], "MMM dd, yyyy")
      : "—";

  const emptyState = (
    <CustomersEmptyState
      searching={debouncedSearchQuery.trim().length > 0}
      query={debouncedSearchQuery.trim()}
      customerNoun={terms.customer}
      vehicleNoun={terms.vehicle}
      onClearSearch={() => setSearchQuery("")}
      onAdd={() => setOpen(true)}
    />
  );
  const errorState = (
    <CustomersErrorState message={customersError || ""} onRetry={() => fetchCustomers()} />
  );

  return (
    <AppLayout title={`${terms.customer}s`}>
      <PullToRefreshContainer
        containerRef={containerRef}
        isRefreshing={isRefreshing}
      >
      <div className="space-y-4">
        {/* Page header: eyebrow + H2 (the shell owns the H1) + the one primary action */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Directory</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">{terms.customer}s</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Find a {terms.customer.toLowerCase()} to see their {terms.vehicle.toLowerCase()}s and service history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add {terms.customer}
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

        {/* Search is the primary job — prominent, full-width, live result count */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={`Search by name, phone, or email`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-11 pr-20 text-base"
              aria-label={`Search ${terms.customer.toLowerCase()}s`}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="iconXs"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-11 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:block" aria-hidden="true">
              /
            </kbd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="font-mono text-sm" aria-live="polite">
              <span className="font-semibold text-foreground">{filteredCustomers.length}</span>{" "}
              <span className="text-muted-foreground">of {customers.length} {terms.customer.toLowerCase()}s</span>
            </p>
            {!customersLoading && !customersError && (
              <p className="font-mono text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{totalVehicles}</span> {terms.vehicle.toLowerCase()}s
                <span className="mx-2" aria-hidden="true">·</span>
                <span className="font-semibold text-foreground">{servicedCount}</span> serviced
              </p>
            )}
          </div>
        </div>

        {/* Directory — one panel: desktop table, mobile cards */}
        <Card density="compact" className="border-border/50">
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <Table density="compact">
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs font-medium uppercase tracking-wider">{terms.customer}</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider">Phone</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider">{terms.vehicle}s</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider">Last {terms.service}</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customersLoading ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <TableRow key={`skeleton-${idx}`} className="border-border/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <div className="space-y-1.5">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                      </TableRow>
                    ))
                  ) : customersError ? (
                    <TableRow>
                      <TableCell colSpan={5}>{errorState}</TableCell>
                    </TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>{emptyState}</TableCell>
                    </TableRow>
                  ) : (
                    pagedCustomers.map((customer) => (
                      <TableRow
                        key={customer.id}
                        className="cursor-pointer border-border/50 transition-colors hover:bg-muted/40"
                        onClick={() => navigate(`/customers/${customer.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-sm text-primary">
                                {getInitials(customer.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/customers/${customer.id}`); }}
                                className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
                              >
                                {customer.name}
                              </button>
                              {customer.email && (
                                <span className="block truncate" onClick={(e) => e.stopPropagation()}>
                                  <ClickableEmail email={customer.email} showIcon={false} className="text-sm font-normal" />
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {customer.phone ? (
                            <ClickablePhone
                              phone={customer.phone}
                              showIcon={false}
                              className="font-mono text-sm font-normal text-foreground hover:text-primary"
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {vehicleLabel(customer.id)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lastServiceLabel(customer.id)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <CustomerRowActions
                            customer={customer}
                            onView={(id) => navigate(`/customers/${id}`)}
                            onEdit={openEditDialog}
                            onDelete={handleDelete}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: same data as stacked cards */}
            <div className="space-y-2 p-3 md:hidden">
              {customersLoading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`m-skeleton-${idx}`} className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="mt-3 h-4 w-1/2" />
                  </div>
                ))
              ) : customersError ? (
                <div className="rounded-lg border border-border/50">{errorState}</div>
              ) : filteredCustomers.length === 0 ? (
                <div className="rounded-lg border border-border/50">{emptyState}</div>
              ) : (
                pagedCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="rounded-lg border border-border/50 p-4 transition-colors active:bg-muted/40"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-sm text-primary">
                            {getInitials(customer.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/customers/${customer.id}`); }}
                            className="block max-w-full truncate text-left text-sm font-medium text-foreground"
                          >
                            {customer.name}
                          </button>
                          {customer.email && (
                            <span className="block truncate" onClick={(e) => e.stopPropagation()}>
                              <ClickableEmail email={customer.email} showIcon={false} className="text-sm font-normal" />
                            </span>
                          )}
                        </div>
                      </div>
                      <span onClick={(e) => e.stopPropagation()}>
                        <CustomerRowActions
                          customer={customer}
                          onView={(id) => navigate(`/customers/${id}`)}
                          onEdit={openEditDialog}
                          onDelete={handleDelete}
                        />
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {customer.phone && (
                        <span onClick={(e) => e.stopPropagation()}>
                          <ClickablePhone
                            phone={customer.phone}
                            showIcon={false}
                            className="font-mono text-sm font-normal text-foreground hover:text-primary"
                          />
                        </span>
                      )}
                      <Badge variant="outline" className="font-normal">
                        {vehicleLabel(customer.id)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Last {terms.service.toLowerCase()}: {lastServiceLabel(customer.id)}
                      </span>
                    </div>
                  </div>
                ))
              )}
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
