import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchVehiclePhoto } from "@/application/queries/booking-vehicle.query";
import { decodeVinNumber } from "@/application/commands/vin.command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { Car, Search, Loader2, Plus, Trash2, Droplet, Info, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useVehicleSpecs } from "@/hooks/useVehicleSpecs";
import { WheelTireConfigurator } from "@/components/vehicles/WheelTireConfigurator";
import type { BookingRequirement, VehicleSelectorKind } from "@/lib/service-category-policy";
import { TireInventorySelector } from "@/components/booking/TireInventorySelector";
import { TireQuantitySelector } from "@/components/booking/TireQuantitySelector";
import { uploadBookingAssessmentPhoto } from "@/application/commands/booking-assessment.command";
import { resolveDetailingRule, type DetailingPricingRule } from "@/lib/detailing-pricing";
import { getInitialTireQuantities, getRequestedTireQuantity, reconcileTireQuantitiesForFitment } from "@/lib/tire-quantity";

export interface VehicleData {
  id: string;
  year: string;
  make: string;
  model: string;
  engine?: string;
  licensePlate: string;
  vin: string;
  mileage: string;
  // Vehicle specs from database
  oilType?: string;
  oilCapacity?: string;
  /**
   * Provenance of the oilCapacity value. Only "db" capacities (matched against
   * the vehicle_specifications table) are used for billing extra-quart oil
   * usage in the booking pricing engine. VIN-decoded and manual values are
   * displayed for review but never priced until the vehicle database confirms them.
   */
  oilCapacitySource?: "db" | "ai" | "manual";
  transmissionFluid?: string;
  additionalSpecs?: Record<string, string | null>;
  /** Filters returned by the VIN decoder after vehicle identity is confirmed. */
  filterMatches?: Array<{ filterType: string; brand: string; partNumber: string }>;
  // Tire vertical (wheel_tire selector)
  tireSize?: string;
  rearTireSize?: string;
  tireSizeSource?: "oe" | "manual";
  tireFrontQuantity?: number;
  tireRearQuantity?: number;
  tireInventoryItemId?: string;
  tireInventorySku?: string;
  tireInventoryName?: string;
  tireUnitPrice?: number;
  tireMountAndBalance?: boolean;
  tireTpms?: boolean;
  tireDisposal?: boolean;
  detailingVehicleSize?: "compact" | "midsize" | "large" | "oversize";
  detailingCondition?: "light" | "moderate" | "heavy";
  detailingHasWater?: boolean;
  detailingHasPower?: boolean;
  detailingHasCoveredArea?: boolean;
  detailingMobileAccessConfirmed?: boolean;
  detailingPetHair?: boolean;
  detailingBiohazard?: boolean;
  detailingPhotos?: string[];
  detailingPhotoRequired?: boolean;
  detailingQuoteRequired?: boolean;
  detailingWaterRequired?: boolean;
  detailingPowerRequired?: boolean;
  detailingCoveredAreaRequired?: boolean;
  detailingPriceMultiplier?: number;
  detailingDurationMultiplier?: number;
  detailingFlatFee?: number;
  // Vehicle image from Auto.dev API
  imageUrl?: string;
}

interface VehicleEntryProps {
  vehicles: VehicleData[];
  onVehiclesChange: (vehicles: VehicleData[]) => void;
  /** Category-driven selector: tire categories use the wheel/tire configurator. */
  vehicleSelector?: VehicleSelectorKind;
  /** When false, no oil/fluid specification UI is rendered at all. */
  showFluidSpecs?: boolean;
  bookingRequirements?: BookingRequirement[];
  businessUserId?: string;
  detailingRules?: DetailingPricingRule[];
}


const generateYears = () => {
  // Generate years from 2026 down to 1990 (matching available spec data)
  const years = [];
  for (let y = 2026; y >= 1990; y--) {
    years.push(y.toString());
  }
  return years;
};

const createEmptyVehicle = (): VehicleData => ({
  id: crypto.randomUUID(),
  year: "",
  make: "",
  model: "",
  engine: "",
  licensePlate: "",
  vin: "",
  mileage: "",
  oilType: "",
  oilCapacity: "",
});

type FallbackMode = "none" | "manual";
const TIRE_SERVICE_OPTIONS: Array<{field:"tireMountAndBalance"|"tireTpms"|"tireDisposal";label:string;fallback:boolean}> = [
  { field:"tireMountAndBalance",label:"Mount & balance",fallback:true },
  { field:"tireTpms",label:"TPMS service",fallback:false },
  { field:"tireDisposal",label:"Old tire disposal",fallback:true },
];

export function VehicleEntry({
  vehicles,
  onVehiclesChange,
  vehicleSelector = "ymm_engine",
  showFluidSpecs = true,
  bookingRequirements,
  businessUserId,
  detailingRules = [],
}: VehicleEntryProps) {
  const needsTire = bookingRequirements?.includes("tire_fitment") ?? vehicleSelector === "wheel_tire";
  const needsOil = bookingRequirements?.includes("oil_fitment") ?? showFluidSpecs;
  const needsTireQuantity = bookingRequirements?.includes("tire_quantity") ?? needsTire;
  const needsDetailing = bookingRequirements?.includes("detailing_assessment") ?? false;
  const isTireFlow = needsTire && !needsOil;
  const showFluids = showFluidSpecs && needsOil;

  const [activeVehicleId, setActiveVehicleId] = useState(vehicles[0]?.id || "");
  const [entryMode, setEntryMode] = useState<"manual" | "vin">("manual");
  const [vinLoading, setVinLoading] = useState(false);
  const [fallbackMode, setFallbackMode] = useState<FallbackMode>("none");
  

  const activeVehicle = vehicles.find(v => v.id === activeVehicleId) || vehicles[0];
  const activeDetailingRule = activeVehicle ? resolveDetailingRule(detailingRules, activeVehicle) : null;

  // Use vehicle specs from database for dropdowns (makes, models, engines)
  // Note: years come from generateYears() to show full range 1990-2026
  const { makes, models, engines, matchedSpec, loading: specsLoading, needsFallback } = useVehicleSpecs({
    year: activeVehicle?.year,
    make: activeVehicle?.make,
    model: activeVehicle?.model,
  });

  const updateVehicle = useCallback((id: string, updates: Partial<VehicleData>) => {
    onVehiclesChange(
      vehicles.map(v => v.id === id ? { ...v, ...updates } : v)
    );
  }, [onVehiclesChange, vehicles]);

  const updateTireFitment = useCallback((next: Partial<VehicleData>) => {
    if (!activeVehicle) return;

    const tireSizeChanged =
      next.tireSize !== undefined &&
      next.tireSize.trim() !== (activeVehicle.tireSize ?? "").trim();
    const tireSizeCleared = next.tireSize !== undefined && !next.tireSize.trim();
    const nextRearTireSize = tireSizeCleared
      ? undefined
      : next.rearTireSize !== undefined
        ? next.rearTireSize
        : activeVehicle.rearTireSize;
    const fitmentChanged =
      tireSizeCleared ||
      (next.rearTireSize !== undefined &&
        next.rearTireSize.trim() !== (activeVehicle.rearTireSize ?? "").trim());

    updateVehicle(activeVehicle.id, {
      ...next,
      ...(tireSizeChanged
        ? {
            tireInventoryItemId: undefined,
            tireInventorySku: undefined,
            tireInventoryName: undefined,
            tireUnitPrice: undefined,
          }
        : {}),
      ...(tireSizeCleared
        ? {
            rearTireSize: undefined,
            tireFrontQuantity: undefined,
            tireRearQuantity: undefined,
          }
        : fitmentChanged
          ? reconcileTireQuantitiesForFitment(activeVehicle, nextRearTireSize)
          : {}),
    });
  }, [activeVehicle, updateVehicle]);

  useEffect(() => {
    if (
      !needsTireQuantity ||
      !activeVehicle?.tireSize ||
      activeVehicle.tireFrontQuantity !== undefined ||
      activeVehicle.tireRearQuantity !== undefined
    ) return;

    updateVehicle(
      activeVehicle.id,
      getInitialTireQuantities(Boolean(activeVehicle.rearTireSize?.trim())),
    );
  }, [
    activeVehicle?.id,
    activeVehicle?.rearTireSize,
    needsTireQuantity,
    activeVehicle?.tireFrontQuantity,
    activeVehicle?.tireRearQuantity,
    activeVehicle?.tireSize,
    updateVehicle,
  ]);

  useEffect(() => {
    if (!activeVehicle || !activeDetailingRule) return;
    const photoRequired = activeDetailingRule.photoRequired || activeVehicle.detailingBiohazard === true;
    const quoteRequired = activeDetailingRule.quoteRequired || activeVehicle.detailingBiohazard === true;
    if (activeVehicle.detailingPhotoRequired !== photoRequired || activeVehicle.detailingQuoteRequired !== quoteRequired || activeVehicle.detailingWaterRequired!==activeDetailingRule.requiresWater || activeVehicle.detailingPowerRequired!==activeDetailingRule.requiresPower || activeVehicle.detailingCoveredAreaRequired!==activeDetailingRule.requiresCoveredArea || activeVehicle.detailingPriceMultiplier!==activeDetailingRule.priceMultiplier || activeVehicle.detailingDurationMultiplier!==activeDetailingRule.durationMultiplier || activeVehicle.detailingFlatFee!==activeDetailingRule.flatFee) updateVehicle(activeVehicle.id,{detailingPhotoRequired:photoRequired,detailingQuoteRequired:quoteRequired,detailingWaterRequired:activeDetailingRule.requiresWater,detailingPowerRequired:activeDetailingRule.requiresPower,detailingCoveredAreaRequired:activeDetailingRule.requiresCoveredArea,detailingPriceMultiplier:activeDetailingRule.priceMultiplier,detailingDurationMultiplier:activeDetailingRule.durationMultiplier,detailingFlatFee:activeDetailingRule.flatFee});
  }, [activeDetailingRule, activeVehicle, updateVehicle]);

  // Update vehicle specs when a match is found
  useEffect(() => {
    if (!needsOil) return;
    if (matchedSpec && activeVehicle) {
      const needsUpdate = 
        activeVehicle.oilType !== matchedSpec.oil_type ||
        activeVehicle.oilCapacity !== matchedSpec.oil_capacity;
      
      if (needsUpdate) {
        updateVehicle(activeVehicle.id, {
          oilType: matchedSpec.oil_type || "",
          oilCapacity: matchedSpec.oil_capacity || "",
          oilCapacitySource: matchedSpec.oil_capacity ? "db" : undefined,
          transmissionFluid: matchedSpec.transmission_fluid || "",
          additionalSpecs: matchedSpec.additional_specs || undefined,
        });
      }
    }
  }, [matchedSpec, activeVehicle, updateVehicle, needsOil]);


  const addVehicle = () => {
    const newVehicle = createEmptyVehicle();
    onVehiclesChange([...vehicles, newVehicle]);
    setActiveVehicleId(newVehicle.id);
  };

  const removeVehicle = (id: string) => {
    if (vehicles.length <= 1) {
      toast.error("You need at least one vehicle");
      return;
    }
    const newVehicles = vehicles.filter(v => v.id !== id);
    onVehiclesChange(newVehicles);
    if (activeVehicleId === id) {
      setActiveVehicleId(newVehicles[0].id);
    }
  };

  const handleYearChange = (year: string) => {
    // Reset make/model when year changes
    updateVehicle(activeVehicle.id, { 
      year, 
      make: "", 
      model: "", 
      engine: "",
      oilType: "",
      oilCapacity: "",
    });
    setFallbackMode("none");
  };

  const handleMakeChange = (make: string) => {
    // Reset model when make changes
    updateVehicle(activeVehicle.id, { 
      make, 
      model: "", 
      engine: "",
      oilType: "",
      oilCapacity: "",
    });
  };

  const handleModelChange = (model: string) => {
    updateVehicle(activeVehicle.id, { model, engine: "" });
  };

  const handleEngineChange = (engine: string) => {
    const selectedEngine = engines.find(e => e.engine === engine);
    if (selectedEngine) {
      updateVehicle(activeVehicle.id, { 
        engine,
        oilType: selectedEngine.spec.oil_type || "",
        oilCapacity: selectedEngine.spec.oil_capacity || "",
        oilCapacitySource: selectedEngine.spec.oil_capacity ? "db" : undefined,
        transmissionFluid: selectedEngine.spec.transmission_fluid || "",
        additionalSpecs: selectedEngine.spec.additional_specs || undefined,
      });
    }
  };


  const handleVinLookup = async () => {
    if (!activeVehicle?.vin || activeVehicle.vin.length !== 17) {
      toast.error("Please enter a valid 17-character VIN");
      return;
    }

    setVinLoading(true);
    try {
      // Decode VIN via edge function (proxies NHTSA server-side)
      const decoded = await decodeVinNumber(activeVehicle.vin);

      const year = decoded.year ? String(decoded.year) : "";
      const make = decoded.make || "";
      const model = decoded.model || "";
      // Engine drives the filter-match lookup — keep whatever the VIN resolves.
      const engine = (decoded.engine || "").trim();

      if (year || make || model) {
        updateVehicle(activeVehicle.id, {
          year,
          make,
          model,
          ...(engine ? { engine } : {}),
          ...(decoded.oilSpecs?.oilType ? { oilType: decoded.oilSpecs.oilType } : {}),
          ...(decoded.oilSpecs?.oilCapacity
            ? { oilCapacity: decoded.oilSpecs.oilCapacity, oilCapacitySource: "manual" as const }
            : {}),
          ...(decoded.vehicleSpecs?.transmissionFluid
            ? { transmissionFluid: decoded.vehicleSpecs.transmissionFluid }
            : {}),
          ...(decoded.filters?.length
            ? { filterMatches: decoded.filters.map(({ filterType, brand, partNumber }) => ({ filterType, brand, partNumber })) }
            : {}),
        });
        toast.success("Vehicle information found!");
      } else {
        toast.error("Could not decode VIN. Please enter manually.");
      }

      // Fetch vehicle photo from Auto.dev API via edge function
      try {
        const imageUrl = await fetchVehiclePhoto(activeVehicle.vin);
        if (imageUrl) {
          updateVehicle(activeVehicle.id, { imageUrl });
        }
      } catch {
        // Photo lookup is non-critical, silently ignore
      }
    } catch {
      toast.error("VIN lookup failed. Please enter manually.");
    }
    setVinLoading(false);
  };

  // Always use the full range of years (1990-2026) for customer selection
  // The database lookup supplies available makes, models, engines, and oil specs.
  const yearOptions = generateYears();

  // Show fallback banner when:
  // 1. Year is selected AND (no data for that year in specs OR specs are still loading)
  // 2. AND user hasn't chosen a fallback mode yet
  const needsFallbackOrLoading = needsFallback || specsLoading;
  const showFallbackBanner = activeVehicle?.year && needsFallbackOrLoading && fallbackMode === "none";
  
  // Show normal dropdowns only when:
  // 1. Data is fully loaded (not specsLoading)
  // 2. We have data for the selected year (not needsFallback)
  // 3. We have makes to display OR no year is selected yet
  const showNormalDropdowns = !specsLoading && !needsFallback && (makes.length > 0 || !activeVehicle?.year);

  return (
    <div className="space-y-4">
      {/* Vehicle Tabs */}
      {vehicles.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {vehicles.map((v, idx) => (
            <Button
              key={v.id}
              variant={activeVehicleId === v.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveVehicleId(v.id)}
              className="gap-2"
            >
              <Car className="h-4 w-4" />
              Vehicle {idx + 1}
              {v.year && v.make ? `: ${v.year} ${v.make}` : ""}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {/* Entry Mode Toggle */}
          <Tabs value={entryMode} onValueChange={(v) => setEntryMode(v as "manual" | "vin")} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Select Vehicle</TabsTrigger>
              <TabsTrigger value="vin">Enter by VIN</TabsTrigger>
            </TabsList>

            <TabsContent value="vin" className="space-y-4 mt-4">
              <div>
                <Label>Vehicle Identification Number (VIN)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={activeVehicle?.vin || ""}
                    onChange={(e) => updateVehicle(activeVehicle.id, { vin: e.target.value.toUpperCase() })}
                    placeholder="Enter 17-character VIN"
                    maxLength={17}
                    className="font-mono"
                  />
                  <Button 
                    onClick={handleVinLookup} 
                    disabled={vinLoading || (activeVehicle?.vin?.length !== 17)}
                  >
                    {vinLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Find your VIN on the driver's side dashboard or door jamb
                </p>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                {specsLoading ? "Loading vehicle data..." : "Select your vehicle details below"}
              </p>
            </TabsContent>
          </Tabs>

          {/* Vehicle Details (shown for both modes) */}
          <div className="space-y-4">
            {isTireFlow ? (<>
              <WheelTireConfigurator
                value={{
                  year: activeVehicle?.year || "",
                  make: activeVehicle?.make || "",
                  model: activeVehicle?.model || "",
                  tireSize: activeVehicle?.tireSize || "",
                  rearTireSize: activeVehicle?.rearTireSize,
                  tireSizeSource: activeVehicle?.tireSizeSource,
                }}
                onChange={updateTireFitment}
              />
              {needsTireQuantity && activeVehicle?.tireSize && (
                <TireQuantitySelector
                  isStaggered={Boolean(activeVehicle.rearTireSize)}
                  frontQuantity={activeVehicle.tireFrontQuantity}
                  rearQuantity={activeVehicle.tireRearQuantity}
                  onChange={(quantities) => updateVehicle(activeVehicle.id, quantities)}
                />
              )}
              {needsTireQuantity && businessUserId && activeVehicle?.tireSize && <TireInventorySelector businessUserId={businessUserId} tireSize={activeVehicle.tireSize} requestedQuantity={getRequestedTireQuantity(activeVehicle)} selectedId={activeVehicle.tireInventoryItemId} onClearSelection={() => updateVehicle(activeVehicle.id, { tireInventoryItemId: undefined, tireInventorySku: undefined, tireInventoryName: undefined, tireUnitPrice: undefined })} onSelect={(item) => updateVehicle(activeVehicle.id, { tireInventoryItemId: item.id, tireInventorySku: item.sku || undefined, tireInventoryName: item.name, tireUnitPrice: Number(item.sell_price) })} />}
              {activeVehicle?.tireSize && <div className="grid gap-2 rounded-lg border p-4 sm:grid-cols-3">{TIRE_SERVICE_OPTIONS.map(({field,label,fallback})=><label key={field} className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={(activeVehicle[field] as boolean|undefined)??fallback} onCheckedChange={(checked)=>updateVehicle(activeVehicle.id,{[field]:checked===true})}/>{label}</label>)}</div>}
            </>) : (
            <>
            {/*
              Performance/UX: avoid rendering duplicate "Make" selectors.
              The Make/Model selectors live in the main selection block below.
            */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label>Year *</Label>
                <Select value={activeVehicle?.year || ""} onValueChange={handleYearChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fallback Mode Banner - shown when no data for selected year */}
            {showFallbackBanner && (
              <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <p className="font-medium mb-2">Limited data for {activeVehicle.year} vehicles</p>
                  <p className="text-sm mb-3">Enter the year, make, model, and engine manually, or use the VIN tab to decode the vehicle.</p>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setFallbackMode("manual")}
                    className="gap-2"
                  >
                    <Edit className="h-4 w-4" />
                    Enter vehicle details
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Normal Make/Model dropdowns (when data exists and loaded) */}
            {showNormalDropdowns && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Make *</Label>
                    <Select 
                      value={activeVehicle?.make || ""} 
                      onValueChange={handleMakeChange}
                      disabled={!activeVehicle?.year}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={activeVehicle?.year ? "Select make" : "Select year first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {makes.map(make => (
                          <SelectItem key={make} value={make}>{make}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Model *</Label>
                    <Select 
                      value={activeVehicle?.model || ""} 
                      onValueChange={handleModelChange}
                      disabled={!activeVehicle?.make}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={activeVehicle?.make ? "Select model" : "Select make first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map(model => (
                          <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {engines.length > 1 && (
                  <div>
                    <Label>Engine</Label>
                    <Select 
                      value={activeVehicle?.engine || ""} 
                      onValueChange={handleEngineChange}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select engine" />
                      </SelectTrigger>
                      <SelectContent>
                        {engines.map(({ engine, spec }) => (
                          <SelectItem key={engine} value={engine}>
                            {engine} {showFluids && spec.oil_capacity ? `(${spec.oil_capacity})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* Manual Entry Mode */}
            {fallbackMode === "manual" && needsFallbackOrLoading && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Edit className="h-4 w-4" />
                  Vehicle details
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Make *</Label>
                    <Input
                      value={activeVehicle?.make || ""}
                      onChange={(e) => updateVehicle(activeVehicle.id, { make: e.target.value })}
                      placeholder="e.g., Toyota"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Model *</Label>
                    <Input
                      value={activeVehicle?.model || ""}
                      onChange={(e) => updateVehicle(activeVehicle.id, { model: e.target.value })}
                      placeholder="e.g., Camry"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Engine (Optional)</Label>
                    <Input
                      value={activeVehicle?.engine || ""}
                      onChange={(e) => updateVehicle(activeVehicle.id, { engine: e.target.value })}
                      placeholder="e.g., 2.5L 4-Cyl"
                      className="mt-1"
                    />
                  </div>
                  {showFluids && (
                  <div>
                    <Label>Oil Type (Optional)</Label>
                    <Input
                      value={activeVehicle?.oilType || ""}
                      onChange={(e) => updateVehicle(activeVehicle.id, { oilType: e.target.value })}
                      placeholder="e.g., 0W-20"
                      className="mt-1"
                    />
                  </div>
                  )}
                </div>

                {showFluids && (
                <div>
                  <Label>Oil Capacity (Optional)</Label>
                  <Input
                    value={activeVehicle?.oilCapacity || ""}
                    onChange={(e) => updateVehicle(activeVehicle.id, {
                      oilCapacity: e.target.value,
                      oilCapacitySource: e.target.value ? "manual" : undefined,
                    })}
                    placeholder="e.g., 5.0 qts"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    For reference only — extra-quart charges only apply when capacity is verified against our vehicle database.
                  </p>
                </div>
                )}


                <p className="text-xs text-muted-foreground">
                  Your provider will verify these specifications
                </p>

              </div>
            )}

            {activeVehicle?.filterMatches?.length ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">Matched filters</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {activeVehicle.filterMatches.map((filter) => (
                    <li key={`${filter.filterType}-${filter.brand}-${filter.partNumber}`}>
                      {filter.filterType}: {filter.brand} {filter.partNumber}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Oil Capacity Display — suppressed for tire/detailing categories */}
            {showFluids && activeVehicle?.oilCapacity && (
              <div className="p-3 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Droplet className="h-4 w-4 text-primary" />
                  Vehicle Specifications
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Oil Type:</span>
                    <Badge variant="outline" className="ml-2">{activeVehicle.oilType}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Capacity:</span>
                    <Badge variant="secondary" className="ml-2">{activeVehicle.oilCapacity}</Badge>
                  </div>
                </div>
              </div>
            )}
            </>
            )}

            {needsTire && !isTireFlow && (
              <WheelTireConfigurator
                value={{ year: activeVehicle?.year || "", make: activeVehicle?.make || "", model: activeVehicle?.model || "", tireSize: activeVehicle?.tireSize || "", rearTireSize: activeVehicle?.rearTireSize, tireSizeSource: activeVehicle?.tireSizeSource }}
                onChange={updateTireFitment}
                title="Tire fitment"
                showVehicleSelectors={false}
              />
            )}

            {needsTireQuantity && !isTireFlow && activeVehicle?.tireSize && (
              <TireQuantitySelector
                isStaggered={Boolean(activeVehicle.rearTireSize)}
                frontQuantity={activeVehicle.tireFrontQuantity}
                rearQuantity={activeVehicle.tireRearQuantity}
                onChange={(quantities) => updateVehicle(activeVehicle.id, quantities)}
              />
            )}

            {needsTireQuantity && !isTireFlow && businessUserId && activeVehicle?.tireSize && <TireInventorySelector businessUserId={businessUserId} tireSize={activeVehicle.tireSize} requestedQuantity={getRequestedTireQuantity(activeVehicle)} selectedId={activeVehicle.tireInventoryItemId} onClearSelection={() => updateVehicle(activeVehicle.id, { tireInventoryItemId: undefined, tireInventorySku: undefined, tireInventoryName: undefined, tireUnitPrice: undefined })} onSelect={(item) => updateVehicle(activeVehicle.id, { tireInventoryItemId: item.id, tireInventorySku: item.sku || undefined, tireInventoryName: item.name, tireUnitPrice: Number(item.sell_price) })} />}

            {needsDetailing && (
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">Detailing assessment</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>Vehicle size *</Label><Select value={activeVehicle?.detailingVehicleSize || ""} onValueChange={(value) => updateVehicle(activeVehicle.id, { detailingVehicleSize: value as VehicleData["detailingVehicleSize"] })}><SelectTrigger className="mt-1"><SelectValue placeholder="Select size" /></SelectTrigger><SelectContent><SelectItem value="compact">Car / compact</SelectItem><SelectItem value="midsize">Midsize SUV / truck</SelectItem><SelectItem value="large">3-row SUV / full-size truck</SelectItem><SelectItem value="oversize">Van / oversized</SelectItem></SelectContent></Select></div>
                  <div><Label>Current condition *</Label><Select value={activeVehicle?.detailingCondition || ""} onValueChange={(value) => updateVehicle(activeVehicle.id, { detailingCondition: value as VehicleData["detailingCondition"] })}><SelectTrigger className="mt-1"><SelectValue placeholder="Select condition" /></SelectTrigger><SelectContent><SelectItem value="light">Light maintenance clean</SelectItem><SelectItem value="moderate">Moderate soil / stains</SelectItem><SelectItem value="heavy">Heavy soil / pet hair / odor</SelectItem></SelectContent></Select></div>
                </div>
                <p className="text-xs text-muted-foreground">Your provider will confirm condition and final pricing before work begins.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={activeVehicle?.detailingMobileAccessConfirmed||false} onCheckedChange={(checked)=>updateVehicle(activeVehicle.id,{detailingMobileAccessConfirmed:checked===true})}/>There is safe mobile-service access</label>
                  <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={activeVehicle?.detailingPetHair||false} onCheckedChange={(checked)=>updateVehicle(activeVehicle.id,{detailingPetHair:checked===true})}/>Pet hair requires removal</label>
                  <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={activeVehicle?.detailingBiohazard||false} onCheckedChange={(checked)=>updateVehicle(activeVehicle.id,{detailingBiohazard:checked===true,detailingQuoteRequired:checked===true,detailingPhotoRequired:checked===true})}/>Mold, bodily fluids, or hazardous contamination</label>
                  {(activeDetailingRule?.requiresWater)&&<label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={activeVehicle?.detailingHasWater||false} onCheckedChange={(checked)=>updateVehicle(activeVehicle.id,{detailingHasWater:checked===true})}/>Water hookup is available</label>}
                  {(activeDetailingRule?.requiresPower)&&<label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={activeVehicle?.detailingHasPower||false} onCheckedChange={(checked)=>updateVehicle(activeVehicle.id,{detailingHasPower:checked===true})}/>Power outlet is available</label>}
                  {(activeDetailingRule?.requiresCoveredArea)&&<label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={activeVehicle?.detailingHasCoveredArea||false} onCheckedChange={(checked)=>updateVehicle(activeVehicle.id,{detailingHasCoveredArea:checked===true})}/>Covered work area is available</label>}
                </div>
                {(activeDetailingRule?.photoRequired||activeVehicle?.detailingPhotoRequired)&&<div className="rounded-md bg-amber-50 p-3"><Label>Condition photo required *</Label><Input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2" onChange={async(e)=>{const file=e.target.files?.[0];if(!file||!businessUserId)return;try{const url=await uploadBookingAssessmentPhoto(businessUserId,activeVehicle.id,file);updateVehicle(activeVehicle.id,{detailingPhotos:[...(activeVehicle.detailingPhotos||[]),url],detailingPhotoRequired:true});toast.success("Assessment photo added");}catch(error){toast.error(error instanceof Error?error.message:"Photo upload failed")}}}/><p className="mt-1 text-xs text-muted-foreground">{activeVehicle?.detailingPhotos?.length||0} photo(s) added</p></div>}
                {(activeDetailingRule?.quoteRequired||activeVehicle?.detailingQuoteRequired)&&<Alert className="border-amber-300 bg-amber-50"><Info className="h-4 w-4"/><AlertDescription><strong>Quote required.</strong> The displayed amount is a starting estimate. The provider will confirm scope and final price before service.</AlertDescription></Alert>}
              </div>
            )}


            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>License Plate</Label>
                <Input
                  value={activeVehicle?.licensePlate || ""}
                  onChange={(e) => updateVehicle(activeVehicle.id, { licensePlate: e.target.value.toUpperCase() })}
                  placeholder="ABC-1234"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Current Mileage</Label>
                <Input
                  type="number"
                  value={activeVehicle?.mileage || ""}
                  onChange={(e) => updateVehicle(activeVehicle.id, { mileage: e.target.value })}
                  placeholder="e.g., 50000"
                  className="mt-1"
                />
              </div>
            </div>

            {entryMode === "manual" && (
              <div>
                <Label>VIN (Optional)</Label>
                <Input
                  value={activeVehicle?.vin || ""}
                  onChange={(e) => updateVehicle(activeVehicle.id, { vin: e.target.value.toUpperCase() })}
                  placeholder="Optional - 17 characters"
                  maxLength={17}
                  className="mt-1 font-mono"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={addVehicle}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Another Vehicle
            </Button>

            {vehicles.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeVehicle(activeVehicle.id)}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Remove This Vehicle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
