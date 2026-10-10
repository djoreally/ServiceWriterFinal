/**
 * FleetVehiclesPage — vehicle registry (visual redesign).
 *
 * Cognitive-load design: a 4-KPI strip with mono numerals answers "how big is
 * this fleet and what needs data", then a single dense toolbar narrows it
 * down. Each row reads as one line: identity, then facts in mono, then the
 * canonical status pill. Data logic (filters, sort, pagination) unchanged.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { fetchFleetVehicleFormOptions, fetchFleetVehiclesPage, subscribeToFleetList, type FleetVehicleFormOptions, type FleetVehicleListItem } from "@/application/queries";
import { Car, Search, Plus, MapPin, FileText, Hash, Gauge, ChevronRight, Upload, Building2, X } from "lucide-react";
import { AddVehicleDialog } from "@/components/fleet/AddVehicleDialog";
import { useAuth } from "@packages/auth";
import {
  FleetIntro,
  FleetKpi,
  FleetKpiSkeleton,
  FleetStatusPill,
  FleetListSkeleton,
  FleetError,
} from "@/components/fleet/FleetViewPrimitives";

const ALL = "all";
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
type VehicleDataFilter = "all" | "missing_vin" | "missing_location" | "missing_contract";
type VehicleSort = "recent" | "client" | "unit" | "year_desc" | "mileage_desc";

const FleetVehiclesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<FleetVehicleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [aggregates, setAggregates] = useState({ total: 0, active: 0, maintenance: 0, incomplete: 0 });
  const [filterOptions, setFilterOptions] = useState<FleetVehicleFormOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [locationFilter, setLocationFilter] = useState(ALL);
  const [contractFilter, setContractFilter] = useState(ALL);
  const [dataFilter, setDataFilter] = useState<VehicleDataFilter>("all");
  const [sortBy, setSortBy] = useState<VehicleSort>("recent");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [result, options] = await Promise.all([fetchFleetVehiclesPage({ page, pageSize, search, clientId: clientFilter === ALL ? undefined : clientFilter, status: statusFilter === ALL ? undefined : statusFilter, locationId: locationFilter === ALL ? undefined : locationFilter, contractId: contractFilter === ALL ? undefined : contractFilter, dataFilter: dataFilter === "all" ? undefined : dataFilter, sort: sortBy }), filterOptions ? Promise.resolve(filterOptions) : fetchFleetVehicleFormOptions()]);
      setVehicles(result.rows);
      setTotal(result.total);
      setAggregates(result.aggregates);
      setFilterOptions(options);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [clientFilter, contractFilter, dataFilter, filterOptions, locationFilter, page, pageSize, search, sortBy, statusFilter]);

  useEffect(() => {
    void Promise.resolve().then(() => loadVehicles());
  }, [loadVehicles]);
  useEffect(() => {
    if (!user?.id) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return subscribeToFleetList(user.id, "fleet_vehicles", () => { clearTimeout(timer); timer = setTimeout(() => { void loadVehicles(); }, 150); });
  }, [loadVehicles, user?.id]);

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    filterOptions?.clients.forEach((v) => map.set(v.id, v.company_name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filterOptions]);

  const locationOptions = useMemo(() => {
    const map = new Map<string, string>();
    filterOptions?.locations.forEach((v) => map.set(v.id, v.name || "Unnamed location"));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filterOptions]);

  const contractOptions = useMemo(() => {
    const map = new Map<string, string>();
    filterOptions?.contracts.forEach((v) => map.set(v.id, v.name || "Unnamed contract"));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filterOptions]);

  useEffect(() => {
    void Promise.resolve().then(() => setPage(1));
  }, [clientFilter, contractFilter, dataFilter, locationFilter, pageSize, search, sortBy, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedVehicles = vehicles;
  const startRow = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRow = Math.min(safePage * pageSize, total);
  const filtersActive = Boolean(search.trim()) || [clientFilter, statusFilter, locationFilter, contractFilter].some((v) => v !== ALL) || dataFilter !== "all" || sortBy !== "recent";

  const resetFilters = () => {
    setSearch("");
    setClientFilter(ALL);
    setStatusFilter(ALL);
    setLocationFilter(ALL);
    setContractFilter(ALL);
    setDataFilter("all");
    setSortBy("recent");
  };

  return (
    <FleetOSLayout title="Vehicles">
      <div className="space-y-5">
        <FleetIntro
          eyebrow="Vehicle registry"
          description="Every unit across your fleet accounts — search by VIN, unit, plate, or client, and spot records that still need data."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => navigate("/fleet-os/vehicles/import")}>
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Vehicle
              </Button>
            </>
          }
        />

        {loading ? (
          <FleetKpiSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FleetKpi label="Total vehicles" value={aggregates.total} />
            <FleetKpi label="Active" value={aggregates.active} />
            <FleetKpi
              label="In maintenance"
              value={aggregates.maintenance}
              tone={aggregates.maintenance > 0 ? "warning" : "default"}
            />
            <FleetKpi
              label="Needs data"
              value={aggregates.incomplete}
              tone={aggregates.incomplete > 0 ? "warning" : "default"}
              hint="Missing VIN or assignment"
            />
          </div>
        )}

        {/* Filter toolbar — one dense row, no titled card around it */}
        <div className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search VIN, unit #, make, model, plate, client, location, or contract…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All clients</SelectItem>
                  {clientOptions.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All locations</SelectItem>
                  {locationOptions.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={contractFilter} onValueChange={setContractFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Contract" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All contracts</SelectItem>
                  {contractOptions.map((contract) => <SelectItem key={contract.id} value={contract.id}>{contract.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={dataFilter} onValueChange={(value) => setDataFilter(value as VehicleDataFilter)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Data quality" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All data</SelectItem>
                  <SelectItem value="missing_vin">Missing VIN</SelectItem>
                  <SelectItem value="missing_location">Missing location</SelectItem>
                  <SelectItem value="missing_contract">Missing contract</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as VehicleSort)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Sort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Newest first</SelectItem>
                  <SelectItem value="client">Client then unit</SelectItem>
                  <SelectItem value="unit">Unit #</SelectItem>
                  <SelectItem value="year_desc">Newest model year</SelectItem>
                  <SelectItem value="mileage_desc">Highest mileage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{total}</span>{" "}
              matching of <span className="font-mono">{aggregates.total}</span> vehicles
            </p>
            {filtersActive && (
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters} className="h-8 px-2 text-xs">
                <X className="mr-1 h-3 w-3" /> Clear filters
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <FleetListSkeleton rows={6} />
        ) : error ? (
          <FleetError
            title="Couldn't load vehicles"
            message="Check your connection and try again. Your vehicle records are safe."
            onRetry={loadVehicles}
          />
        ) : total === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Car className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-lg font-semibold">No vehicles found</p>
              <p className="text-sm leading-6 text-muted-foreground mt-1 mb-4">
                {aggregates.total === 0 ? "Add vehicles one at a time, or bring a whole fleet in with a CSV." : "Try clearing filters, or add a vehicle for this client."}
              </p>
              <div className="flex justify-center gap-2">
                {filtersActive && <Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button>}
                <Button variant="outline" size="sm" onClick={() => navigate("/fleet-os/vehicles/import")}>
                  <Upload className="h-4 w-4 mr-1" /> CSV Import
                </Button>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Vehicle
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>Showing <span className="font-mono">{startRow}-{endRow}</span> of <span className="font-mono">{total}</span></p>
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number])}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {paginatedVehicles.map((v) => (
                <Card
                  key={v.id}
                  className="cursor-pointer transition-colors hover:border-primary/40"
                  onClick={() => navigate(`/fleet-os/vehicles/${v.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Car className="h-5 w-5 text-muted-foreground" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">
                              {v.year || "—"} {v.make || "Unknown"} {v.model || "Vehicle"}
                            </p>
                            <FleetStatusPill domain="fleetAsset" status={v.status} />
                            {!v.vin && <Badge variant="outline" className="text-[10px]">Missing VIN</Badge>}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                            {v.unit_number && (
                              <span className="flex items-center gap-1.5">
                                <Hash className="h-3.5 w-3.5" />
                                <span className="font-mono text-[13px]">{v.unit_number}</span>
                              </span>
                            )}
                            {v.vin && (
                              <span className="font-mono text-[13px]">{v.vin}</span>
                            )}
                            {v.mileage != null && (
                              <span className="flex items-center gap-1.5">
                                <Gauge className="h-3.5 w-3.5" />
                                <span className="font-mono text-[13px]">{v.mileage.toLocaleString()} mi</span>
                              </span>
                            )}
                            {v.fleet_clients?.company_name && (
                              <span className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5" /> {v.fleet_clients.company_name}
                              </span>
                            )}
                            {v.fleet_locations?.name && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5" /> {v.fleet_locations.name}
                              </span>
                            )}
                            {v.fleet_contracts?.name && (
                              <span className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5" /> {v.fleet_contracts.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {v.license_plate && (
                          <span className="hidden text-xs font-mono bg-muted px-2 py-1 rounded sm:inline-flex">
                            {v.license_plate}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <Pagination className="pt-2">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={safePage === 1}
                      className={safePage === 1 ? "pointer-events-none opacity-50" : undefined}
                      onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((pageNumber) => pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - safePage) <= 1)
                    .map((pageNumber, index, visiblePages) => (
                      <PaginationItem key={pageNumber}>
                        {index > 0 && pageNumber - visiblePages[index - 1] > 1 ? <span className="px-2 text-muted-foreground">…</span> : null}
                        <PaginationLink
                          href="#"
                          isActive={pageNumber === safePage}
                          onClick={(e) => { e.preventDefault(); setPage(pageNumber); }}
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={safePage === totalPages}
                      className={safePage === totalPages ? "pointer-events-none opacity-50" : undefined}
                      onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </div>
      <AddVehicleDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={loadVehicles}
      />
    </FleetOSLayout>
  );
};

export default FleetVehiclesPage;
