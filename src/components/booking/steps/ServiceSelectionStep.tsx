/**
 * ServiceSelectionStep - Step 3: Service Selection
 * Handles individual services, package selection, and subscription plans
 *
 * Presentation notes:
 * - Services use compact selectable rows with search and category filtering.
 * - Category-first mode can start customers at a compact category landing page.
 * - Packages remain compact cards with selectable keyboard-friendly behavior.
 */

import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchServiceCategoryPolicies } from "@/application/queries/service-category-policy.query";
import { Wrench, Clock, CheckCircle2, Package, Plus, Search, ChevronLeft, Grid3X3, ListFilter, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BookingRequirement } from "@/lib/service-category-policy";
import type { VehicleData } from "@/components/booking/VehicleEntry";
import type { VehicleServiceSelection } from "@/hooks/useBookingState";
import { WheelTireConfigurator } from "@/components/vehicles/WheelTireConfigurator";
import { TireQuantitySelector } from "@/components/booking/TireQuantitySelector";
import { TireInventorySelector } from "@/components/booking/TireInventorySelector";
import { getRequestedTireQuantity } from "@/lib/tire-quantity";
import { DetailingAssessmentPanel } from "@/components/booking/DetailingAssessmentPanel";
import type { DetailingPricingRule } from "@/lib/detailing-pricing";

type ServiceDisplayMode = "category_first" | "full_list";

const DEFAULT_CATEGORY = "Services";

/** Turn a free-text service description into a compact preview. */
function getServicePreview(description: string | null | undefined): string | null {
  if (!description) return null;
  return description.replace(/\s+/g, " ").trim() || null;
}

/**
 * Resolve the customer-facing category for a service.
 *
 * The category RECORD (`category_id` -> `service_categories.name`) is
 * authoritative: tire and detailing services often have an empty legacy
 * `category` text column, which previously dumped them into a generic bucket.
 */
function getServiceCategory(
  service: ServiceCatalogItem,
  categoryNames: Record<string, string> = {},
): string {
  const fromRecord = service.category_id ? categoryNames[service.category_id] : undefined;
  return fromRecord?.trim() || service.category?.trim() || DEFAULT_CATEGORY;
}

function matchesServiceSearch(service: ServiceCatalogItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [service.name, service.description, service.category]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalized));
}

function CompactServiceRow({
  service,
  selected,
  onSelect,
  formatCurrency,
  categoryLabel,
}: {
  service: ServiceCatalogItem;
  selected: boolean;
  onSelect: () => void;
  formatCurrency: (amount: number) => string;
  categoryLabel: string;
}) {
  const preview = getServicePreview(service.description);
  const category = categoryLabel;
  const isDetailingEstimate = service.booking_requirements?.includes("detailing_assessment") === true;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "-translate-y-0.5 border-primary bg-primary/5 shadow-md ring-1 ring-primary",
      )}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
              selected ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
            aria-hidden="true"
          >
            {selected ? <CheckCircle2 className="h-4 w-4 animate-in zoom-in duration-200" /> : <Plus className="h-4 w-4" />}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="font-semibold leading-tight text-foreground">{service.name}</h3>
              <p className="shrink-0 text-right text-base font-bold text-primary"><span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{isDetailingEstimate ? "Starting at" : "Price"}</span>{formatCurrency(service.default_price)}</p>
            </div>

            {preview && <p className="line-clamp-2 text-sm text-muted-foreground">{preview}</p>}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <Clock className="h-3 w-3" />
                {service.estimated_duration || 60} min
              </span>
              <span className="rounded-md bg-muted px-2 py-1">{category}</span>
              <span className={cn("rounded-md px-2 py-1 font-medium", selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                {selected ? "Added" : "Add service"}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectablePackageCard({
  title,
  price,
  strikePrice,
  badge,
  duration,
  inclusions,
  blurb,
  selected,
  onSelect,
  formatCurrency,
}: {
  title: string;
  price: number;
  strikePrice?: number | null;
  badge?: string | null;
  duration: number;
  inclusions: string[];
  blurb?: string | null;
  selected: boolean;
  onSelect: () => void;
  formatCurrency: (amount: number) => string;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer transition-all hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold leading-tight">{title}</h3>
              {badge && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{badge}</span>}
            </div>
            {blurb && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{blurb}</p>}
          </div>
          <div className="shrink-0 text-right">
            {strikePrice ? <p className="text-xs text-muted-foreground line-through">{formatCurrency(strikePrice)}</p> : null}
            <p className="text-lg font-bold text-primary">{formatCurrency(price)}</p>
          </div>
        </div>

        {inclusions.length > 0 && (
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {inclusions.slice(0, 4).map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                <span className="line-clamp-1">{item}</span>
              </li>
            ))}
            {inclusions.length > 4 && <li className="pl-5">+{inclusions.length - 4} more services</li>}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
            <Clock className="h-3 w-3" />
            {duration} min
          </span>
          <span className={cn("rounded-md px-3 py-1 font-medium", selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
            {selected ? "Package added" : "Add package"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}


/**
 * Single source of truth for a bookable catalog service. PublicBooking imports
 * this type instead of declaring a second, incompatible shape (which produced a
 * handler-variance error at the ServiceSelectionStep boundary).
 */
export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  estimated_duration: number | null;
  category: string | null;
  category_id?: string | null;
  booking_requirements?: BookingRequirement[];
  /** Add-on / upsell items are offered at checkout, never as standalone services. */
  is_upsell?: boolean;
}

export interface ServicePackageItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  package_price: number;
  discount_type: string;
  discount_value: number;
  estimated_duration: number | null;
  services: ServicePackageItem[];
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_cycle: string;
  tier: string;
  features: string[];
  badge_label: string | null;
  badge_color: string | null;
  highlight: boolean;
  cta_label: string | null;
  display_order: number;
}

interface ServiceSelectionStepProps {
  services: ServiceCatalogItem[];
  packages: ServicePackage[];
  subscriptionPlans?: SubscriptionPlan[];
  selectedServices: ServiceCatalogItem[];
  selectedPackage: ServicePackage | null;
  vehicles?: VehicleData[];
  vehicleServiceSelections?: Record<string, VehicleServiceSelection>;
  onVehicleServiceChange?: (vehicleId: string, selection: VehicleServiceSelection) => void;
  onVehicleChange?: (vehicleId: string, patch: Partial<VehicleData>) => void;
  businessUserId?: string;
  serviceViewMode: "services" | "packages" | "subscriptions";
  setServiceViewMode: (mode: "services" | "packages" | "subscriptions") => void;
  onToggleService: (service: ServiceCatalogItem) => void;
  onSelectPackage: (pkg: ServicePackage) => void;
  formatCurrency: (amount: number) => string;
  getTotalPrice: () => number;
  getTotalDuration: () => number;
  serviceDisplayMode?: ServiceDisplayMode;
  detailingRules?: DetailingPricingRule[];
}

/** ⚡ Memoized — 376-line component with catalog rendering, avoids re-render on parent state changes */
export const ServiceSelectionStep = memo(function ServiceSelectionStep({
  services,
  packages,
  subscriptionPlans = [],
  selectedServices,
  selectedPackage,
  vehicles = [],
  vehicleServiceSelections,
  onVehicleServiceChange,
  onVehicleChange,
  businessUserId,
  serviceViewMode,
  setServiceViewMode,
  onToggleService,
  onSelectPackage,
  formatCurrency,
  getTotalPrice,
  getTotalDuration,
  serviceDisplayMode = "full_list",
  detailingRules = [],
}: ServiceSelectionStepProps) {
  const { data: categoryRows } = useQuery({
    queryKey: ["service-category-policies"],
    queryFn: fetchServiceCategoryPolicies,
    staleTime: 10 * 60 * 1000,
  });
  const categoryNames = useMemo(() => {
    const map: Record<string, string> = {};
    (categoryRows ?? []).forEach((row) => { map[row.id] = row.name; });
    return map;
  }, [categoryRows]);

  /** Add-ons are surfaced in the checkout add-on step, not the service catalog. */
  const bookableServices = useMemo(() => services.filter((service) => !service.is_upsell), [services]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const [activeVehicleId, setActiveVehicleId] = useState(vehicles[0]?.id || "");

  const activeSelection = activeVehicleId && vehicleServiceSelections?.[activeVehicleId]
    ? vehicleServiceSelections[activeVehicleId]
    : { services: selectedServices, package: selectedPackage };
  const activeServices = activeSelection.services as ServiceCatalogItem[];
  const activePackage = activeSelection.package as ServicePackage | null;
  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId);
  const activeServiceIds = activePackage ? activePackage.services.map((service) => service.id) : activeServices.map((service) => service.id);
  const activeRequiresTire = activeServiceIds.some((id) => services.find((service) => service.id === id)?.booking_requirements?.includes("tire_fitment"));
  const activeRequiresOil = activeServiceIds.some((id) => services.find((service) => service.id === id)?.booking_requirements?.includes("oil_fitment"));
  const activeRequiresDetailing = activeServiceIds.some((id) => services.find((service) => service.id === id)?.booking_requirements?.includes("detailing_assessment"));
  const activeVehicleLabel = [activeVehicle?.year, activeVehicle?.make, activeVehicle?.model].filter(Boolean).join(" ");
  const updateActiveSelection = (selection: VehicleServiceSelection) => {
    if (activeVehicleId && onVehicleServiceChange) onVehicleServiceChange(activeVehicleId, selection);
  };
  const handleToggleService = (service: ServiceCatalogItem) => {
    const exists = activeServices.some((item) => item.id === service.id);
    updateActiveSelection({ services: exists ? activeServices.filter((item) => item.id !== service.id) : [...activeServices, service], package: null });
  };
  const handleSelectPackage = (pkg: ServicePackage) => {
    updateActiveSelection({ services: [], package: activePackage?.id === pkg.id ? null : pkg });
  };

  const categorySummaries = useMemo(() => {
    const counts = bookableServices.reduce<Record<string, number>>((acc, service) => {
      const category = getServiceCategory(service, categoryNames);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  }, [bookableServices, categoryNames]);

  const showCategoryLanding = serviceDisplayMode === "category_first" && categorySummaries.length > 1 && !selectedCategory && !searchQuery.trim() && !showFullCatalog;

  const visibleServices = useMemo(() => {
    return bookableServices.filter((service) => {
      const matchesCategory = !selectedCategory || getServiceCategory(service, categoryNames) === selectedCategory;
      return matchesCategory && matchesServiceSearch(service, searchQuery);
    });
  }, [bookableServices, categoryNames, selectedCategory, searchQuery]);

  return (
    <div>
      <div className="text-center mb-8">
        <Wrench className="h-12 w-12 mx-auto text-primary mb-4" />
        <h2 className="text-2xl font-bold mb-2">Select your services</h2>
        <p className="text-muted-foreground">Choose a one-time service or save with a package.</p>
      </div>

      {activeRequiresOil && activeVehicle && onVehicleChange && (
        <div className="mb-6 rounded-2xl border border-amber-300/60 bg-amber-50/60 p-4 shadow-sm">
          <p className="mb-3 font-semibold">Oil specifications for this vehicle</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Engine</Label><Input value={activeVehicle.engine || ""} onChange={(event) => onVehicleChange(activeVehicle.id, { engine: event.target.value })} placeholder="e.g. 2.5L" /></div>
            <div><Label>Oil type</Label><Input value={activeVehicle.oilType || ""} onChange={(event) => onVehicleChange(activeVehicle.id, { oilType: event.target.value })} placeholder="e.g. 0W-20" /></div>
            <div><Label>Oil capacity</Label><Input value={activeVehicle.oilCapacity || ""} onChange={(event) => onVehicleChange(activeVehicle.id, { oilCapacity: event.target.value, oilCapacitySource: event.target.value ? "manual" : undefined })} placeholder="e.g. 5.0 qts" /></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">These oil specifications apply only to this vehicle.</p>
        </div>
      )}

      {activeRequiresTire && activeVehicle && onVehicleChange && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
          <WheelTireConfigurator value={{ year: activeVehicle.year || "", make: activeVehicle.make || "", model: activeVehicle.model || "", tireSize: activeVehicle.tireSize || "", rearTireSize: activeVehicle.rearTireSize, tireSizeSource: activeVehicle.tireSizeSource }} onChange={(patch) => onVehicleChange(activeVehicle.id, patch)} title={activeVehicleLabel ? `Tire fitment for ${activeVehicleLabel}` : "Tire fitment for this vehicle"} showVehicleSelectors={false} />
          {activeVehicle.tireSize && <TireQuantitySelector isStaggered={Boolean(activeVehicle.rearTireSize)} frontQuantity={activeVehicle.tireFrontQuantity} rearQuantity={activeVehicle.tireRearQuantity} onChange={(quantities) => onVehicleChange(activeVehicle.id, quantities)} />}
          {businessUserId && activeVehicle.tireSize && <TireInventorySelector businessUserId={businessUserId} tireSize={activeVehicle.tireSize} requestedQuantity={getRequestedTireQuantity(activeVehicle)} selectedId={activeVehicle.tireInventoryItemId} onClearSelection={() => onVehicleChange(activeVehicle.id, { tireInventoryItemId: undefined, tireInventorySku: undefined, tireInventoryName: undefined, tireUnitPrice: undefined })} onSelect={(item) => onVehicleChange(activeVehicle.id, { tireInventoryItemId: item.id, tireInventorySku: item.sku || undefined, tireInventoryName: item.name, tireUnitPrice: Number(item.sell_price) })} />}
        </div>
      )}

      {activeRequiresDetailing && activeVehicle && onVehicleChange && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
          <DetailingAssessmentPanel
            vehicle={activeVehicle}
            detailingRules={detailingRules}
            businessUserId={businessUserId}
            onChange={(patch) => onVehicleChange(activeVehicle.id, patch)}
          />
        </div>
      )}

      {vehicles.length > 0 && (
        <div className="mb-6 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-semibold">Configure services for each vehicle</p><p className="text-xs text-muted-foreground">Select a vehicle below, then choose only the services needed for that vehicle.</p></div><span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"}</span></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((vehicle, index) => { const selection = vehicleServiceSelections?.[vehicle.id] || { services: [], package: null }; const label = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || `Vehicle ${index + 1}`; const count = selection.package ? selection.package.services.length : selection.services.length; return <button key={vehicle.id} type="button" onClick={() => setActiveVehicleId(vehicle.id)} className={cn("rounded-xl border p-3 text-left transition-colors", activeVehicleId === vehicle.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50")}><p className="font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{count} service{count === 1 ? "" : "s"} assigned</p></button>; })}</div>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex rounded-lg border bg-muted p-1 flex-wrap justify-center gap-1">
          <button
            onClick={() => setServiceViewMode("services")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
              serviceViewMode === "services"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Wrench className="h-4 w-4" />
            One-time service
          </button>
          {packages.length > 0 && (
            <button
              onClick={() => setServiceViewMode("packages")}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                serviceViewMode === "packages"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Package className="h-4 w-4" />
              Save with a package
            </button>
          )}
        </div>
      </div>

      {/* Individual Services View */}
      {serviceViewMode !== "packages" && (
        <div className="mb-6 space-y-4">
          {bookableServices.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No services available at this time.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {serviceDisplayMode === "category_first" ? <Grid3X3 className="h-4 w-4 text-primary" /> : <ListFilter className="h-4 w-4 text-primary" />}
                      {serviceDisplayMode === "category_first" ? "Browse by category" : "Full service list"}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {serviceDisplayMode === "category_first"
                        ? "Pick a category first, or search the full catalog."
                        : "Search or filter the complete service catalog."}
                    </p>
                  </div>

                  <div className="relative w-full md:max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search services..."
                      className="pl-9 pr-9"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear service search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {!showCategoryLanding && categorySummaries.length > 1 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={!selectedCategory ? "default" : "outline"}
                      onClick={() => { setSelectedCategory(null); setShowFullCatalog(true); }}
                      className="shrink-0"
                    >
                      All
                    </Button>
                    {categorySummaries.map(([category, count]) => (
                      <Button
                        key={category}
                        type="button"
                        size="sm"
                        variant={selectedCategory === category ? "default" : "outline"}
                        onClick={() => { setSelectedCategory(category); setShowFullCatalog(false); }}
                        className="shrink-0"
                      >
                        {category}
                        <span className="ml-1 text-xs opacity-70">{count}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {showCategoryLanding ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categorySummaries.map(([category, count]) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => { setSelectedCategory(category); setShowFullCatalog(false); }}
                      className="rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{category}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{count} service{count === 1 ? "" : "s"}</p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Wrench className="h-5 w-5" />
                        </div>
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setSelectedCategory(null); setShowFullCatalog(true); }}
                    className="rounded-2xl border border-dashed bg-background p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="font-semibold">View all services</p>
                    <p className="mt-1 text-sm text-muted-foreground">Show the complete catalog instead.</p>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedCategory && serviceDisplayMode === "category_first" && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedCategory(null); setShowFullCatalog(false); }} className="gap-2">
                      <ChevronLeft className="h-4 w-4" />
                      Back to categories
                    </Button>
                  )}

                  {visibleServices.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No services match your search or category.
                      </CardContent>
                    </Card>
                  ) : (
                    visibleServices.map((service) => (
                      <CompactServiceRow
                        key={service.id}
                        service={service}
                        selected={Boolean(activeServices.find((s) => s.id === service.id))}
                        onSelect={() => handleToggleService(service)}
                        formatCurrency={formatCurrency}
                        categoryLabel={getServiceCategory(service, categoryNames)}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Service Packages View */}
      {serviceViewMode === "packages" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
          {packages.length === 0 ? (
            <p className="text-muted-foreground col-span-full text-center py-8">
              No service packages available at this time.
            </p>
          ) : (
            packages.map(pkg => {
              const isSelected = activePackage?.id === pkg.id;
              const originalPrice = pkg.services.reduce(
                (sum, s) => sum + (s.price * s.quantity),
                0
              );
              const savings = originalPrice - Number(pkg.package_price);
              const inclusions = pkg.services.map((s) => `${s.quantity > 1 ? `${s.quantity}x ` : ""}${s.name}`);
              return (
                <SelectablePackageCard
                  key={pkg.id}
                  title={pkg.name}
                  price={Number(pkg.package_price)}
                  strikePrice={savings > 0 ? originalPrice : null}
                  badge={savings > 0 ? `Best value · Save ${formatCurrency(savings)}` : "Best value"}
                  duration={pkg.estimated_duration || 60}
                  inclusions={inclusions}
                  blurb={pkg.description}
                  selected={isSelected}
                  onSelect={() => handleSelectPackage(pkg)}
                  formatCurrency={formatCurrency}
                />
              );
            })

          )}
        </div>
      )}

      {/* Summary - for individual services */}
      {serviceViewMode === "services" && activeServices.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{activeServices.length} service(s) selected</p>
                <p className="text-sm text-muted-foreground">
                  Est. time: {getTotalDuration()} minutes
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{formatCurrency(getTotalPrice())}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary - for packages */}
      {serviceViewMode === "packages" && activePackage && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{activePackage.name}</p>
                <p className="text-sm text-muted-foreground">
                  Est. time: {activePackage.estimated_duration || 60} minutes
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(Number(activePackage.package_price))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
