import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  countVehicleSpecs, countFilterApplications, searchVehicleSpecs, decodeVin as decodeVinEdge,
  searchFilterCrossRefs, fetchMaintenanceSchedule, decodePlate as decodePlateEdge,
  fetchYmmtSpecs, seedVehicleSpecsChunk, seedFilters as seedFiltersEdge,
} from "@/application/queries/vehicle-specs-page.query";
import { toast } from "sonner";
import {
  Search,
  Droplet,
  Database,
  Loader2,
  Car,
  Fuel,
  Settings2,
  CheckCircle2,
  Upload,
  RefreshCw,
  Wrench,
  ScanLine,
  Filter,
  Calendar,
  ArrowRightLeft,
  RectangleHorizontal,
  CircleDot,
  Info,
  List,
  AlertTriangle,
  Download,
  Headphones,
  CheckCircle,
} from "lucide-react";
import { useVehicleSpecs, VehicleSpec } from "@/hooks/useVehicleSpecs";
import { VinScanner } from "@/components/vehicles/VinScanner";
import { cn } from "@/lib/utils";

// Tab definitions for the icon card grid
const TAB_ITEMS = [
  { id: "oil-lookup", label: "Oil Lookup", icon: Droplet },
  { id: "vin-scanner", label: "VIN Scanner", icon: ScanLine },
  { id: "plate-decoder", label: "Plate Decoder", icon: RectangleHorizontal },
  { id: "twb-specs", label: "Tires/Wheels", icon: CircleDot },
  { id: "filter-crossref", label: "Filter X-Ref", icon: ArrowRightLeft },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
] as const;

export default function VehicleSpecs() {
  const [activeTab, setActiveTab] = useState("oil-lookup");

  // ── Oil Lookup state (tab 1) ──
  const [searchYear, setSearchYear] = useState("");
  const [searchMake, setSearchMake] = useState("");
  const [searchModel, setSearchModel] = useState("");
  const [searchEngine, setSearchEngine] = useState("");
  const [searchResults, setSearchResults] = useState<VehicleSpec[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [vinInput, setVinInput] = useState("");
  const [isDecodingVin, setIsDecodingVin] = useState(false);
  const [decodedOilSpecs, setDecodedOilSpecs] = useState<{
    oilType: string | null;
    oilCapacity: string | null;
    vehicle?: { year: number; make: string; model: string; engine?: string };
  } | null>(null);

  // ── Seeding state ──
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedingProgress, setSeedingProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [isSeedingFilters, setIsSeedingFilters] = useState(false);
  const [totalSpecs, setTotalSpecs] = useState(0);
  const [totalFilters, setTotalFilters] = useState(0);

  // ── Filter Cross-Reference state ──
  const [filterPartNumber, setFilterPartNumber] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterCrossResults, setFilterCrossResults] = useState<any[]>([]);
  const [isSearchingFilters, setIsSearchingFilters] = useState(false);

  // ── Maintenance state ──
  const [maintYear, setMaintYear] = useState("");
  const [maintMake, setMaintMake] = useState("");
  const [maintModel, setMaintModel] = useState("");
  const [maintenanceResults, setMaintenanceResults] = useState<{ miles: number; km: number; service_items: string[] }[]>([]);
  const [maintenanceVehicle, setMaintenanceVehicle] = useState<{ year?: number; make?: string; model?: string; trim?: string } | null>(null);
  const [isSearchingMaintenance, setIsSearchingMaintenance] = useState(false);
  const [maintenanceVinInput, setMaintenanceVinInput] = useState("");

  // ── Plate Decoder state ──
  const [plateNumber, setPlateNumber] = useState("");
  const [plateState, setPlateState] = useState("");
  const [isDecodingPlate, setIsDecodingPlate] = useState(false);
  const [plateResult, setPlateResult] = useState<{
    vin: string; make: string; model: string; year: number;
  } | null>(null);

  // ── Tires, Wheels & Brakes state ──
  const [twbYears, setTwbYears] = useState<number[]>([]);
  const [twbMakes, setTwbMakes] = useState<string[]>([]);
  const [twbModels, setTwbModels] = useState<string[]>([]);
  const [twbTrims, setTwbTrims] = useState<string[]>([]);
  const [twbYear, setTwbYear] = useState("");
  const [twbMake, setTwbMake] = useState("");
  const [twbModel, setTwbModel] = useState("");
  const [twbTrim, setTwbTrim] = useState("");
  const [twbLoading, setTwbLoading] = useState(false);
  const [twbLoadingOptions, setTwbLoadingOptions] = useState(false);
  const [twbResult, setTwbResult] = useState<{
    brakes: Record<string, string | null>;
    wheels: Record<string, string | null>;
    tires: Record<string, string | null>;
  } | null>(null);

  // ── Cascading dropdown hooks ──
  const oilSpecs = useVehicleSpecs({ year: searchYear, make: searchMake, model: searchModel });
  const maintSpecs = useVehicleSpecs({ year: maintYear, make: maintMake, model: maintModel });

  useEffect(() => {
    const countData = async () => {
      const [specsResult, filtersResult] = await Promise.all([
        countVehicleSpecs(),
        countFilterApplications(),
      ]);
      setTotalSpecs(specsResult.count || 0);
      setTotalFilters(filtersResult.count || 0);
    };
    countData();
  }, []);

  // ── Oil Lookup handlers ──
  const handleSearch = async () => {
    if (!searchYear && !searchMake && !searchModel) {
      toast.error("Please select at least one search criteria");
      return;
    }
    setIsSearching(true);
    const { data, error } = await searchVehicleSpecs(
      searchYear ? parseInt(searchYear) : undefined,
      searchMake || undefined,
      searchModel || undefined,
    );
    if (error) {
      toast.error("Failed to search specifications");
    } else {
      const mappedResults: VehicleSpec[] = (data || []).map((item: any) => ({
        id: item.id, year: item.year, make: item.make, model: item.model,
        engine: item.engine, oil_type: item.oil_type, oil_capacity: item.oil_capacity,
        oil_plug_torque: item.additional_specs?.oil_plug_torque || null,
        transmission_fluid: item.transmission_fluid, additional_specs: item.additional_specs,
      }));
      setSearchResults(mappedResults);
      if (mappedResults.length === 0) toast.info("No specifications found for this vehicle");
    }
    setIsSearching(false);
  };

  const handleDecodeVin = async () => {
    if (!vinInput || vinInput.length !== 17) { toast.error("Please enter a valid 17-character VIN"); return; }
    setIsDecodingVin(true);
    setDecodedOilSpecs(null);
    try {
      const { data, error } = await decodeVinEdge(vinInput);
      if (error) throw error;
      if (data?.year && data?.make && data?.model) {
        const { year, make, model, engine } = data;
        if (year) setSearchYear(year.toString());
        if (make) setSearchMake(make);
        if (model) setSearchModel(model);
        if (engine) setSearchEngine(engine);
        toast.success(`VIN decoded: ${year} ${make} ${model}`);
        if (data.oilSpecs) {
          setDecodedOilSpecs({ oilType: data.oilSpecs.oilType, oilCapacity: data.oilSpecs.oilCapacity, vehicle: { year, make, model, engine } });
        } else {
          setDecodedOilSpecs(null);
        }
      } else {
        toast.error("Could not decode VIN - vehicle not found");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to decode VIN");
    } finally {
      setIsDecodingVin(false);
    }
  };

  const clearOilSearch = () => {
    setSearchYear(""); setSearchMake(""); setSearchModel(""); setSearchEngine("");
    setSearchResults([]); setVinInput(""); setDecodedOilSpecs(null);
  };

  const selectedSpec = useMemo(() => {
    if (searchEngine && oilSpecs.engines.length > 0) {
      return oilSpecs.engines.find(e => e.engine === searchEngine)?.spec || null;
    }
    return oilSpecs.matchedSpec;
  }, [searchEngine, oilSpecs.engines, oilSpecs.matchedSpec]);

  // ── Filter Cross-Reference handlers ──
  const handleSearchFilterCrossRef = async () => {
    if (!filterPartNumber.trim()) { toast.error("Please enter a filter part number"); return; }
    setIsSearchingFilters(true);
    try {
      const { data, error } = await searchFilterCrossRefs(filterPartNumber);
      if (error) throw error;
      setFilterCrossResults(data || []);
      if ((data || []).length === 0) toast.info("No cross-references found for this part number");
    } catch { toast.error("Failed to search cross-references"); } finally { setIsSearchingFilters(false); }
  };

  // ── Maintenance handlers ──
  const handleSearchMaintenance = async () => {
    const hasVin = maintenanceVinInput.trim().length === 17;
    const hasYmm = maintYear && maintMake && maintModel;
    if (!hasVin && !hasYmm) { toast.error("Enter a 17-character VIN or select Year/Make/Model"); return; }

    setIsSearchingMaintenance(true);
    setMaintenanceResults([]);
    setMaintenanceVehicle(null);
    try {
      const body: Record<string, any> = {};
      if (hasVin) { body.vin = maintenanceVinInput.trim().toUpperCase(); }
      else { body.year = parseInt(maintYear); body.make = maintMake; body.model = maintModel; }

      const { data, error } = await fetchMaintenanceSchedule(body);
      if (error) throw error;
      if (data?.success && data.maintenance?.length > 0) {
        setMaintenanceResults(data.maintenance);
        setMaintenanceVehicle(data.vehicle || null);
        toast.success(`Found ${data.maintenance.length} maintenance intervals`);
      } else {
        toast.info(data?.error || "No maintenance data found for this vehicle");
      }
    } catch { toast.error("Failed to fetch maintenance schedules"); } finally { setIsSearchingMaintenance(false); }
  };

  // ── Plate Decoder handler ──
  const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
  ];

  const handleDecodePlate = async () => {
    if (!plateNumber.trim()) { toast.error("Please enter a license plate number"); return; }
    if (!plateState) { toast.error("Please select a state"); return; }
    setIsDecodingPlate(true);
    setPlateResult(null);
    try {
      const { data, error } = await decodePlateEdge(plateNumber.trim(), plateState);
      if (error) throw error;
      if (data?.success && data.vehicle) {
        setPlateResult(data.vehicle);
        toast.success(`Found: ${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`);
      } else if (data?.integrationUnavailable) {
        toast.error("Vehicle Databases API key not configured. Add VEHICLE_DATABASES_API_KEY in secrets.");
      } else {
        toast.error(data?.error || "Vehicle not found for this plate");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to decode license plate");
    } finally {
      setIsDecodingPlate(false);
    }
  };

  // ⚡ TWB years are static (1981-2026)
  useEffect(() => {
    const yrs: number[] = [];
    for (let y = 2026; y >= 1981; y--) yrs.push(y);
    setTwbYears(yrs);
  }, []);

  useEffect(() => {
    if (!twbYear) { setTwbMakes([]); return; }
    const load = async () => {
      setTwbLoadingOptions(true);
      try {
        const { data, error } = await fetchYmmtSpecs({ action: "makes", year: parseInt(twbYear) });
        if (!error && data?.success) setTwbMakes(data.data || []);
      } catch { /* ignore */ }
      finally { setTwbLoadingOptions(false); }
    };
    load();
  }, [twbYear]);

  useEffect(() => {
    if (!twbYear || !twbMake) { setTwbModels([]); return; }
    const load = async () => {
      setTwbLoadingOptions(true);
      try {
        const { data, error } = await fetchYmmtSpecs({ action: "models", year: parseInt(twbYear), make: twbMake });
        if (!error && data?.success) setTwbModels(data.data || []);
      } catch { /* ignore */ }
      finally { setTwbLoadingOptions(false); }
    };
    load();
  }, [twbYear, twbMake]);

  useEffect(() => {
    if (!twbYear || !twbMake || !twbModel) { setTwbTrims([]); return; }
    const load = async () => {
      setTwbLoadingOptions(true);
      try {
        const { data, error } = await fetchYmmtSpecs({ action: "trims", year: parseInt(twbYear), make: twbMake, model: twbModel });
        if (!error && data?.success) setTwbTrims(data.data || []);
      } catch { /* ignore */ }
      finally { setTwbLoadingOptions(false); }
    };
    load();
  }, [twbYear, twbMake, twbModel]);

  const handleTwbLookup = async () => {
    if (!twbYear || !twbMake || !twbModel || !twbTrim) { toast.error("Please select Year, Make, Model, and Trim"); return; }
    setTwbLoading(true);
    setTwbResult(null);
    try {
      const { data, error } = await fetchYmmtSpecs({
        action: "specs", year: parseInt(twbYear), make: twbMake, model: twbModel, trim: twbTrim,
      });
      if (error) throw error;
      if (data?.success && data.data) {
        setTwbResult(data.data);
        toast.success(`Found specs for ${twbYear} ${twbMake} ${twbModel}`);
      } else {
        toast.info(data?.error || "No tire/wheel/brake data found");
      }
    } catch { toast.error("Failed to fetch specs"); }
    finally { setTwbLoading(false); }
  };

  const clearTwb = () => {
    setTwbYear(""); setTwbMake(""); setTwbModel(""); setTwbTrim("");
    setTwbResult(null); setTwbMakes([]); setTwbModels([]); setTwbTrims([]);
  };

  const handleSeedDatabase = async () => {
    setIsSeeding(true);
    setSeedingProgress({ current: 0, total: 0, percentage: 0 });
    try {
      const origin = window.location.origin;
      toast.info("Loading vehicle data files...");
      const loadJson = async (path: string) => {
        try { const res = await fetch(new URL(path, origin).href, { credentials: 'omit' }); if (!res.ok) throw new Error(); return await res.json(); }
        catch { return []; }
      };
      const [carsFullData, vehicleSpecsFullData, carData2025] = await Promise.all([
        loadJson("/data/cars-full.json"), loadJson("/data/vehicle-specs-full.json"), loadJson("/data/car-data-2025.json"),
      ]);
      const seenKeys = new Set<string>(); const allData: any[] = [];
      const addRecords = (records: any[]) => { for (const rec of records) { const key = `${rec.Year}-${rec.Make}-${rec.Model}-${rec.Engine || ''}`.toLowerCase(); if (!seenKeys.has(key)) { seenKeys.add(key); allData.push(rec); } } };
      addRecords(carData2025); addRecords(vehicleSpecsFullData); addRecords(carsFullData);

      const CHUNK_SIZE = 500; const totalRecords = allData.length; let totalInserted = 0; let totalErrors = 0;
      setSeedingProgress({ current: 0, total: totalRecords, percentage: 0 });
      toast.info(`Processing ${totalRecords} records...`);

      for (let i = 0; i < totalRecords; i += CHUNK_SIZE) {
        const chunk = allData.slice(i, i + CHUNK_SIZE);
        const { data, error } = await seedVehicleSpecsChunk(chunk);
        if (error) { totalErrors += chunk.length; } else { totalInserted += data?.inserted || 0; totalErrors += data?.errors || 0; }
        const processed = Math.min(i + CHUNK_SIZE, totalRecords);
        setSeedingProgress({ current: processed, total: totalRecords, percentage: Math.round((processed / totalRecords) * 100) });
      }
      toast.success(`Completed! Inserted ${totalInserted} specs (${totalErrors} errors)`);
      const { count } = await countVehicleSpecs();
      setTotalSpecs(count || 0);
      setSearchResults([]);
    } catch (error: any) { toast.error(error.message || "Failed to seed database"); }
    finally { setIsSeeding(false); setSeedingProgress({ current: 0, total: 0, percentage: 0 }); }
  };

  const handleSeedFilters = async () => {
    setIsSeedingFilters(true);
    try {
      const origin = window.location.origin;
      const response = await fetch(new URL("/data/fram-filters-sample.json", origin).href, { credentials: 'omit' });
      const filterData = await response.json();
      toast.info(`Seeding ${filterData.filters?.length || 0} filter applications...`);
      const { data, error } = await seedFiltersEdge(filterData);
      if (error) throw error;
      toast.success(`Successfully seeded ${data.applicationsInserted} filters and ${data.crossReferencesInserted} cross-references`);
      const { count } = await countFilterApplications();
      setTotalFilters(count || 0);
    } catch (error: any) { toast.error(error.message || "Failed to seed filters"); }
    finally { setIsSeedingFilters(false); }
  };

  const oilYearOptions = oilSpecs.years.map(y => y.toString());
  const maintYearOptions = maintSpecs.years.map(y => y.toString());

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* ═══════════════ Header ═══════════════ */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vehicle Data Center</h1>
            <p className="text-muted-foreground mt-1">Oil specs, VIN decoding, filters & maintenance schedules</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Stat badges */}
            <div className="flex items-center gap-3">
              <div className="bg-card border rounded-lg px-4 py-2 text-center min-w-[120px]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Vehicles</p>
                <p className="text-2xl font-bold">{totalSpecs.toLocaleString()}</p>
              </div>
              <div className="bg-card border rounded-lg px-4 py-2 text-center min-w-[120px]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Filters</p>
                <p className="text-2xl font-bold">{totalFilters.toLocaleString()}</p>
              </div>
            </div>
            {/* Seed buttons */}
            <div className="flex items-center gap-2">
              {isSeeding && seedingProgress.total > 0 ? (
                <div className="flex items-center gap-2 min-w-[200px]">
                  <div className="flex-1 h-2 bg-muted rounded-md overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${seedingProgress.percentage}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{seedingProgress.percentage}%</span>
                </div>
              ) : (
                <Button onClick={handleSeedDatabase} disabled={isSeeding || isSeedingFilters} variant="outline" size="sm" className="gap-2">
                  {isSeeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Seed Specs
                </Button>
              )}
              <Button onClick={handleSeedFilters} disabled={isSeeding || isSeedingFilters} variant="outline" size="sm" className="gap-2">
                {isSeedingFilters ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                Seed Filters
              </Button>
            </div>
          </div>
        </div>

        {/* ═══════════════ Tab Icon Cards ═══════════════ */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {TAB_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex flex-col items-center gap-2 py-5 px-3 rounded-xl border-2 transition-all duration-200 cursor-pointer",
                "hover:border-primary/50 hover:bg-primary/5",
                activeTab === id
                  ? "border-primary bg-primary/5 text-primary shadow-sm"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-semibold text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>

        {/* ═══════════════ Tab Content ═══════════════ */}

        {/* ── Oil Lookup ── */}
        {activeTab === "oil-lookup" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Column */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Motor Oil Lookup</CardTitle>
                  <p className="text-sm text-muted-foreground">Enter a VIN or select a vehicle to find the recommended oil type and capacity.</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Two-column: VIN + Manual */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* VIN Lookup */}
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <Search className="h-4 w-4" /> Quick VIN Lookup
                      </Label>
                      <div className="relative">
                        <Input
                          placeholder="ENTER 17-DIGIT VIN"
                          value={vinInput}
                          onChange={(e) => setVinInput(e.target.value.toUpperCase())}
                          maxLength={17}
                          className="font-mono uppercase pr-14"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{vinInput.length}/17</span>
                      </div>
                      <Button onClick={handleDecodeVin} disabled={isDecodingVin || vinInput.length !== 17} className="w-full gap-2">
                        {isDecodingVin ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                        Decode
                      </Button>
                      <p className="text-xs text-muted-foreground">The VIN is typically found on the driver's side dashboard or door pillar.</p>
                    </div>

                    {/* Manual Selection */}
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <Settings2 className="h-4 w-4" /> Manual Selection
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={searchYear} onValueChange={(v) => { setSearchYear(v); setSearchMake(""); setSearchModel(""); setSearchEngine(""); }}>
                          <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                          <SelectContent>{oilYearOptions.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={searchMake} onValueChange={(v) => { setSearchMake(v); setSearchModel(""); setSearchEngine(""); }} disabled={!searchYear}>
                          <SelectTrigger><SelectValue placeholder="Make" /></SelectTrigger>
                          <SelectContent>{oilSpecs.makes.map(make => <SelectItem key={make} value={make}>{make}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={searchModel} onValueChange={(v) => { setSearchModel(v); setSearchEngine(""); }} disabled={!searchMake}>
                          <SelectTrigger><SelectValue placeholder="Model" /></SelectTrigger>
                          <SelectContent>{oilSpecs.models.map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={searchEngine} onValueChange={setSearchEngine} disabled={!searchModel || oilSpecs.engines.length === 0}>
                          <SelectTrigger><SelectValue placeholder="Engine" /></SelectTrigger>
                          <SelectContent>{oilSpecs.engines.map(({ engine }) => <SelectItem key={engine} value={engine}>{engine}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleSearch} disabled={isSearching} variant="outline" className="w-full gap-2">
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Search Database
                      </Button>
                    </div>
                  </div>

                  {/* Quick Spec Display */}
                  {(decodedOilSpecs || selectedSpec) && (
                    <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="h-5 w-5 text-gray-600" />
                        <span className="font-semibold">
                          {decodedOilSpecs?.vehicle
                            ? `${decodedOilSpecs.vehicle.year} ${decodedOilSpecs.vehicle.make} ${decodedOilSpecs.vehicle.model}${decodedOilSpecs.vehicle.engine ? ` - ${decodedOilSpecs.vehicle.engine}` : ''}`
                            : `${selectedSpec?.year} ${selectedSpec?.make} ${selectedSpec?.model}${selectedSpec?.engine ? ` - ${selectedSpec.engine}` : ''}`}
                        </span>
                        {decodedOilSpecs && <Badge variant="secondary" className="ml-2"><ScanLine className="h-3 w-3 mr-1" />VIN Decoded</Badge>}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white dark:bg-background p-3 rounded-lg border">
                          <div className="flex items-center gap-1.5 text-amber-600 mb-1"><Fuel className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold uppercase">Oil Type</span></div>
                          <p className="text-lg font-bold">{decodedOilSpecs?.oilType || selectedSpec?.oil_type || "—"}</p>
                        </div>
                        <div className="bg-white dark:bg-background p-3 rounded-lg border">
                          <div className="flex items-center gap-1.5 text-blue-600 mb-1"><Droplet className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold uppercase">Oil Capacity</span></div>
                          <p className="text-lg font-bold">{decodedOilSpecs?.oilCapacity || selectedSpec?.oil_capacity || "—"}</p>
                        </div>
                        <div className="bg-white dark:bg-background p-3 rounded-lg border">
                          <div className="flex items-center gap-1.5 text-purple-600 mb-1"><Settings2 className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold uppercase">Trans. Fluid</span></div>
                          <p className="text-lg font-bold">{selectedSpec?.transmission_fluid || "—"}</p>
                        </div>
                        {selectedSpec?.additional_specs?.oil_plug_torque && (
                          <div className="bg-white dark:bg-background p-3 rounded-lg border">
                            <div className="flex items-center gap-1.5 text-gray-600 mb-1"><Wrench className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold uppercase">Plug Torque</span></div>
                            <p className="text-lg font-bold">{selectedSpec.additional_specs.oil_plug_torque}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-gray-500" />Results ({searchResults.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vehicle</TableHead><TableHead>Engine</TableHead><TableHead>Oil Type</TableHead><TableHead>Oil Capacity</TableHead><TableHead>Transmission</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {searchResults.map((spec) => (
                            <TableRow key={spec.id}>
                              <TableCell><div className="flex items-center gap-2"><Car className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{spec.year} {spec.make} {spec.model}</span></div></TableCell>
                              <TableCell>{spec.engine && <Badge variant="outline" className="gap-1"><Settings2 className="h-3 w-3" />{spec.engine}</Badge>}</TableCell>
                              <TableCell>{spec.oil_type && <Badge className="bg-amber-500 text-white gap-1"><Fuel className="h-3 w-3" />{spec.oil_type}</Badge>}</TableCell>
                              <TableCell>{spec.oil_capacity && <Badge variant="secondary" className="gap-1"><Droplet className="h-3 w-3" />{spec.oil_capacity}</Badge>}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{spec.transmission_fluid || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pro Tips */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-5">
                  <h4 className="font-semibold text-primary flex items-center gap-2 mb-3">
                    <Droplet className="h-4 w-4" /> Maintenance Pro Tips
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    {[
                      "Always check the oil level on a flat surface using the dipstick after filling.",
                      "Replace the oil filter at every oil change to prevent contamination of new oil.",
                      "Follow OEM intervals (typically 5,000–7,500 miles) for optimal engine health.",
                      "Full synthetic oil offers superior protection in extreme temperature ranges.",
                    ].map((tip, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground">{tip}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Common Oil Types */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Common Oil Types</CardTitle>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    { type: "0W-20", desc: "Most modern vehicles" },
                    { type: "5W-30", desc: "Trucks & older engines" },
                    { type: "0W-40", desc: "European performance" },
                    { type: "5W-20", desc: "Ford/Honda standards" },
                  ].map(({ type, desc }) => (
                    <div key={type} className="flex justify-between items-center">
                      <span className="font-semibold text-primary">{type}</span>
                      <span className="text-muted-foreground text-xs">{desc}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Capacity Guide */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Capacity Guide</CardTitle>
                    <List className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    { engine: "4-Cylinder", range: "4 - 5 qts" },
                    { engine: "V6 Engine", range: "5 - 6 qts" },
                    { engine: "V8 Engine", range: "6 - 8 qts" },
                    { engine: "Heavy Diesel", range: "10 - 15 qts" },
                  ].map(({ engine, range }) => (
                    <div key={engine} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{engine}</span>
                      <span className="font-semibold">{range}</span>
                    </div>
                  ))}
                  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> WARNING
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                      Capacities are estimates. Always verify with owner's manual for exact volumes including filter.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Action Links */}
              <Card className="divide-y">
                <button className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <span>Download Full Oil Chart</span>
                  <Download className="h-4 w-4 text-muted-foreground" />
                </button>
                <button className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <span>Contact Parts Specialist</span>
                  <Headphones className="h-4 w-4 text-muted-foreground" />
                </button>
              </Card>
            </div>
          </div>
        )}

        {/* ── VIN Scanner ── */}
        {activeTab === "vin-scanner" && <VinScanner />}

        {/* ── Plate Decoder ── */}
        {activeTab === "plate-decoder" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><RectangleHorizontal className="h-5 w-5" />License Plate Decoder</CardTitle>
              <p className="text-sm text-muted-foreground">Enter a license plate number and state to look up the vehicle VIN and details</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <Label>License Plate</Label>
                  <Input placeholder="e.g. ABC1234" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value.toUpperCase())} maxLength={10} className="mt-1 font-mono uppercase" />
                </div>
                <div>
                  <Label>State</Label>
                  <Select value={plateState} onValueChange={setPlateState}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>{US_STATES.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleDecodePlate} disabled={isDecodingPlate || !plateNumber.trim() || !plateState} className="w-full gap-2">
                    {isDecodingPlate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {isDecodingPlate ? "Looking up..." : "Decode Plate"}
                  </Button>
                </div>
              </div>

              {plateResult && (
                <div className="mt-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-gray-600" />
                    <span className="font-semibold">{plateResult.year} {plateResult.make} {plateResult.model}</span>
                    <Badge variant="secondary" className="ml-auto"><RectangleHorizontal className="h-3 w-3 mr-1" />Plate Decoded</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-background p-3 rounded-lg border">
                      <div className="text-xs font-medium uppercase text-muted-foreground mb-1">VIN</div>
                      <p className="font-mono text-sm font-bold break-all">{plateResult.vin}</p>
                    </div>
                    <div className="bg-white dark:bg-background p-3 rounded-lg border">
                      <div className="text-xs font-medium uppercase text-muted-foreground mb-1">Year</div>
                      <p className="text-lg font-bold">{plateResult.year}</p>
                    </div>
                    <div className="bg-white dark:bg-background p-3 rounded-lg border">
                      <div className="text-xs font-medium uppercase text-muted-foreground mb-1">Make</div>
                      <p className="text-lg font-bold">{plateResult.make}</p>
                    </div>
                    <div className="bg-white dark:bg-background p-3 rounded-lg border">
                      <div className="text-xs font-medium uppercase text-muted-foreground mb-1">Model</div>
                      <p className="text-lg font-bold">{plateResult.model}</p>
                    </div>
                  </div>
                </div>
              )}

              {!plateResult && !isDecodingPlate && (
                <div className="text-center py-8 text-muted-foreground">
                  <RectangleHorizontal className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Enter a license plate and state to decode</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Tires/Wheels/Brakes ── */}
        {activeTab === "twb-specs" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CircleDot className="h-5 w-5" />Tires, Wheels & Brakes</CardTitle>
              <p className="text-sm text-muted-foreground">Look up OEM tire sizes, wheel dimensions, and brake specifications</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Select value={twbYear} onValueChange={(v) => { setTwbYear(v); setTwbMake(""); setTwbModel(""); setTwbTrim(""); setTwbResult(null); }}>
                  <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>{twbYears.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={twbMake} onValueChange={(v) => { setTwbMake(v); setTwbModel(""); setTwbTrim(""); setTwbResult(null); }} disabled={!twbYear}>
                  <SelectTrigger><SelectValue placeholder="Make" /></SelectTrigger>
                  <SelectContent>{twbMakes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={twbModel} onValueChange={(v) => { setTwbModel(v); setTwbTrim(""); setTwbResult(null); }} disabled={!twbMake}>
                  <SelectTrigger><SelectValue placeholder="Model" /></SelectTrigger>
                  <SelectContent>{twbModels.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={twbTrim} onValueChange={setTwbTrim} disabled={!twbModel}>
                  <SelectTrigger><SelectValue placeholder="Trim" /></SelectTrigger>
                  <SelectContent>{twbTrims.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button onClick={handleTwbLookup} disabled={twbLoading || !twbTrim} className="flex-1 gap-2">
                    {twbLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Lookup
                  </Button>
                  <Button variant="outline" onClick={clearTwb} size="icon"><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>

              {twbLoading && (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              )}

              {twbResult && (
                <div className="space-y-4 mt-4">
                  {/* Tires */}
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><CircleDot className="h-5 w-5 text-amber-500" />Tires</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: "Front Tire Size", value: twbResult.tires?.front_tire_size },
                          { label: "Rear Tire Size", value: twbResult.tires?.rear_tire_size },
                          { label: "Front Pressure", value: twbResult.tires?.front_tire_psi },
                          { label: "Rear Pressure", value: twbResult.tires?.rear_tire_psi },
                          { label: "Spare Size", value: twbResult.tires?.spare_tire_size },
                          { label: "Spare Pressure", value: twbResult.tires?.spare_tire_psi },
                        ].filter(item => item.value).map((item) => (
                          <div key={item.label} className="bg-muted/50 p-3 rounded-lg border">
                            <div className="text-xs font-medium uppercase text-muted-foreground mb-1">{item.label}</div>
                            <p className="text-lg font-bold">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  {/* Wheels */}
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" />Wheels</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          { label: "Front Wheel Size", value: twbResult.wheels?.front_wheel_size },
                          { label: "Rear Wheel Size", value: twbResult.wheels?.rear_wheel_size },
                          { label: "Spare Wheel Size", value: twbResult.wheels?.spare_wheel_size },
                          { label: "Wheel Torque", value: twbResult.wheels?.wheel_torque },
                          { label: "Front Material", value: twbResult.wheels?.front_wheel_material },
                          { label: "Rear Material", value: twbResult.wheels?.rear_wheel_material },
                        ].filter(item => item.value).map((item) => (
                          <div key={item.label} className="bg-muted/50 p-3 rounded-lg border">
                            <div className="text-xs font-medium uppercase text-muted-foreground mb-1">{item.label}</div>
                            <p className="text-lg font-bold">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  {/* Brakes */}
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Wrench className="h-5 w-5 text-destructive" />Brakes</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: "Front Rotor Diameter", value: twbResult.brakes?.front_rotor_dia },
                          { label: "Front Rotor Thickness", value: twbResult.brakes?.front_rotor_thickness },
                          { label: "Rear Rotor Diameter", value: twbResult.brakes?.rear_rotor_dia },
                          { label: "Rear Rotor Thickness", value: twbResult.brakes?.rear_rotor_thickness },
                        ].filter(item => item.value).map((item) => (
                          <div key={item.label} className="bg-muted/50 p-3 rounded-lg border">
                            <div className="text-xs font-medium uppercase text-muted-foreground mb-1">{item.label}</div>
                            <p className="text-lg font-bold">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {!twbResult && !twbLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <CircleDot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select a vehicle to view tire, wheel, and brake specifications</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Filter Cross-Reference ── */}
        {activeTab === "filter-crossref" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" />Filter Cross-Reference</CardTitle>
                <p className="text-sm text-muted-foreground">Find equivalent filter part numbers across different brands (Fram, Wix, AC Delco, etc.)</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-col sm:flex-row">
                  <div className="flex-1">
                    <Label htmlFor="filter-part">Part Number</Label>
                    <Input id="filter-part" placeholder="Enter part number (e.g., PH10575)" value={filterPartNumber} onChange={(e) => setFilterPartNumber(e.target.value.toUpperCase())} className="mt-1 font-mono uppercase" />
                  </div>
                  <div className="w-full sm:w-[150px]">
                    <Label htmlFor="filter-brand">Brand (optional)</Label>
                    <Select value={filterBrand} onValueChange={setFilterBrand}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Any brand" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any brand</SelectItem>
                        <SelectItem value="fram">Fram</SelectItem>
                        <SelectItem value="wix">Wix</SelectItem>
                        <SelectItem value="ac_delco">AC Delco</SelectItem>
                        <SelectItem value="bosch">Bosch</SelectItem>
                        <SelectItem value="mobil1">Mobil 1</SelectItem>
                        <SelectItem value="purolator">Purolator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleSearchFilterCrossRef} disabled={isSearchingFilters || !filterPartNumber.trim()} className="gap-2 w-full sm:w-auto">
                      {isSearchingFilters ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search
                    </Button>
                  </div>
                </div>

                {filterCrossResults.length > 0 && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source Brand</TableHead><TableHead>Source Part #</TableHead>
                          <TableHead className="text-center"><ArrowRightLeft className="h-4 w-4 inline" /></TableHead>
                          <TableHead>Target Brand</TableHead><TableHead>Target Part #</TableHead><TableHead>Filter Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filterCrossResults.map((ref) => (
                          <TableRow key={ref.id}>
                            <TableCell><Badge variant="outline" className="capitalize">{ref.source_brand}</Badge></TableCell>
                            <TableCell className="font-mono font-medium">{ref.source_part_number}</TableCell>
                            <TableCell className="text-center text-muted-foreground">↔</TableCell>
                            <TableCell><Badge variant="secondary" className="capitalize">{ref.target_brand}</Badge></TableCell>
                            <TableCell className="font-mono font-medium">{ref.target_part_number}</TableCell>
                            <TableCell><Badge variant={ref.filter_type === 'oil' ? 'default' : 'outline'} className="capitalize">{ref.filter_type || 'Unknown'}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {filterCrossResults.length === 0 && !isSearchingFilters && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Filter className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Enter a filter part number to find cross-references</p>
                    <p className="text-sm mt-1">Example: PH10575, 57502, CA8755A</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Popular Filter Brands</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="p-3 bg-muted/50 rounded-lg border"><span className="font-semibold">Fram</span><p className="text-muted-foreground text-xs mt-0.5">PH series (oil), CA series (air)</p></div>
                <div className="p-3 bg-muted/50 rounded-lg border"><span className="font-semibold">Wix</span><p className="text-muted-foreground text-xs mt-0.5">5-digit numbers (57xxx)</p></div>
                <div className="p-3 bg-muted/50 rounded-lg border"><span className="font-semibold">AC Delco</span><p className="text-muted-foreground text-xs mt-0.5">PF series (oil)</p></div>
                <div className="p-3 bg-muted/50 rounded-lg border"><span className="font-semibold">Bosch</span><p className="text-muted-foreground text-xs mt-0.5">3xxx series</p></div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Maintenance Schedules ── */}
        {activeTab === "maintenance" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Maintenance Schedules</CardTitle>
                <p className="text-sm text-muted-foreground">Look up OEM maintenance schedules by VIN or Year/Make/Model</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Search by VIN (recommended)</Label>
                  <div className="flex gap-2">
                    <Input value={maintenanceVinInput} onChange={(e) => setMaintenanceVinInput(e.target.value.toUpperCase())} placeholder="Enter 17-character VIN" maxLength={17} className="font-mono uppercase" />
                    <Button onClick={handleSearchMaintenance} disabled={isSearchingMaintenance || (maintenanceVinInput.length !== 17 && (!maintYear || !maintMake || !maintModel))} className="gap-2 shrink-0">
                      {isSearchingMaintenance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Lookup
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">OR search by Year / Make / Model</span>
                  <Separator className="flex-1" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Select value={maintYear} onValueChange={(v) => { setMaintYear(v); setMaintMake(""); setMaintModel(""); }}>
                    <SelectTrigger><SelectValue placeholder={maintSpecs.loading ? "Loading..." : "Year"} /></SelectTrigger>
                    <SelectContent>{maintYearOptions.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={maintMake} onValueChange={(v) => { setMaintMake(v); setMaintModel(""); }} disabled={!maintYear}>
                    <SelectTrigger><SelectValue placeholder={maintYear ? "Make" : "Select year first"} /></SelectTrigger>
                    <SelectContent>{maintSpecs.makes.map(make => <SelectItem key={make} value={make}>{make}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={maintModel} onValueChange={setMaintModel} disabled={!maintMake}>
                    <SelectTrigger><SelectValue placeholder={maintMake ? "Model" : "Select make first"} /></SelectTrigger>
                    <SelectContent>{maintSpecs.models.map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button onClick={handleSearchMaintenance} disabled={isSearchingMaintenance || (!maintYear || !maintMake || !maintModel)} variant="outline" className="w-full gap-2">
                    {isSearchingMaintenance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search
                  </Button>
                </div>

                {maintenanceVehicle && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <Car className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{maintenanceVehicle.year} {maintenanceVehicle.make} {maintenanceVehicle.model}{maintenanceVehicle.trim ? ` ${maintenanceVehicle.trim}` : ""}</span>
                    <Badge variant="secondary" className="ml-auto">{maintenanceResults.length} intervals</Badge>
                  </div>
                )}

                {maintenanceResults.length > 0 && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader><TableRow><TableHead>Mileage</TableHead><TableHead>Service Items</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {maintenanceResults.map((interval, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium whitespace-nowrap align-top">
                              {interval.miles?.toLocaleString()} mi
                              <span className="text-muted-foreground text-xs block">({interval.km?.toLocaleString()} km)</span>
                            </TableCell>
                            <TableCell>
                              <ul className="list-disc list-inside space-y-0.5 text-sm">
                                {interval.service_items.map((item: string, i: number) => <li key={i}>{item}</li>)}
                              </ul>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {maintenanceResults.length === 0 && !isSearchingMaintenance && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Enter a VIN or select a vehicle to view OEM maintenance schedules</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Droplet className="h-4 w-4 text-amber-500" />Oil Change</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Conventional</span><span>3,000-5,000 mi</span></div><Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Synthetic Blend</span><span>5,000-7,500 mi</span></div><Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Full Synthetic</span><span>7,500-10,000 mi</span></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Settings2 className="h-4 w-4 text-purple-500" />Transmission</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Automatic</span><span>30,000-60,000 mi</span></div><Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Manual</span><span>30,000-60,000 mi</span></div><Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">CVT</span><span>25,000-50,000 mi</span></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4 text-red-500" />Brakes</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Brake Pads</span><span>25,000-65,000 mi</span></div><Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Brake Rotors</span><span>50,000-70,000 mi</span></div><Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Brake Fluid</span><span>Every 2-3 years</span></div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
