/**
 * TechDataCenter — Mobile-friendly vehicle data center for technicians
 * 
 * Features: VIN decoder, oil/filter specs lookup, maintenance schedules
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Search, Droplet, ScanLine, Filter, Loader2, Car, CheckCircle, AlertTriangle,
  Database,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  decodeVin as decodeVinEdge,
  searchVehicleSpecs,
  searchFilterCrossRefs,
} from "@/application/queries/vehicle-specs-page.query";
import { cn } from "@/lib/utils";

interface VehicleSpec {
  id: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter: string | null;
  air_filter: string | null;
  cabin_filter: string | null;
  drain_plug_torque: string | null;
}

interface FilterResult {
  id: string;
  filter_type: string;
  oem_part_number: string | null;
  fram_part_number: string | null;
  wix_part_number: string | null;
  mobil1_part_number: string | null;
  k_and_n_part_number: string | null;
  bosch_part_number: string | null;
}

export default function TechDataCenter() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("vin");

  // VIN Decoder State
  const [vin, setVin] = useState("");
  const [vinResult, setVinResult] = useState<{
    year: number; make: string; model: string; engine?: string;
  } | null>(null);
  const [vinLoading, setVinLoading] = useState(false);

  // Oil Lookup State
  const [oilYear, setOilYear] = useState<string>("");
  const [oilMake, setOilMake] = useState("");
  const [oilModel, setOilModel] = useState("");
  const [oilResults, setOilResults] = useState<VehicleSpec[]>([]);
  const [oilLoading, setOilLoading] = useState(false);

  // Filter Cross-Reference State
  const [filterQuery, setFilterQuery] = useState("");
  const [filterResults, setFilterResults] = useState<FilterResult[]>([]);
  const [filterLoading, setFilterLoading] = useState(false);

  // Generate years 2026 down to 1990
  const yearOptions = useMemo(() => 
    Array.from({ length: 37 }, (_, i) => 2026 - i), []
  );

  const handleVinDecode = async () => {
    if (vin.length !== 17) {
      toast.error("VIN must be 17 characters");
      return;
    }
    setVinLoading(true);
    setVinResult(null);

    const result = await decodeVinEdge(vin);
    if (result) {
      setVinResult(result);
      toast.success("VIN decoded successfully");
    } else {
      toast.error("Failed to decode VIN");
    }
    setVinLoading(false);
  };

  const handleOilSearch = async () => {
    if (!oilYear || !oilMake) {
      toast.error("Please select year and make");
      return;
    }
    setOilLoading(true);
    const response = await searchVehicleSpecs(
      parseInt(oilYear), 
      oilMake, 
      oilModel || undefined
    );
    const results = (response?.data || []) as unknown as VehicleSpec[];
    setOilResults(results);
    setOilLoading(false);
    if (results.length === 0) {
      toast.info("No specifications found for this vehicle");
    }
  };

  const handleFilterSearch = async () => {
    if (!filterQuery.trim()) {
      toast.error("Enter a filter part number");
      return;
    }
    setFilterLoading(true);
    const response = await searchFilterCrossRefs(filterQuery.trim());
    const results = (response?.data || []) as unknown as FilterResult[];
    setFilterResults(results);
    setFilterLoading(false);
    if (results.length === 0) {
      toast.info("No cross-references found");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 border-b p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold">Vehicle Data Center</h1>
            <p className="text-xs text-muted-foreground">Specs, VIN decode & filters</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="vin" className="text-xs gap-1">
              <ScanLine className="h-3.5 w-3.5" />
              VIN
            </TabsTrigger>
            <TabsTrigger value="oil" className="text-xs gap-1">
              <Droplet className="h-3.5 w-3.5" />
              Oil Specs
            </TabsTrigger>
            <TabsTrigger value="filters" className="text-xs gap-1">
              <Filter className="h-3.5 w-3.5" />
              Filters
            </TabsTrigger>
          </TabsList>

          {/* VIN Decoder Tab */}
          <TabsContent value="vin" className="space-y-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ScanLine className="h-4 w-4" />
                  VIN Decoder
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <div>
                  <Label className="text-xs">Enter 17-digit VIN</Label>
                  <Input
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                    placeholder="1HGCM82633A123456"
                    maxLength={17}
                    className="font-mono"
                  />
                </div>
                <Button 
                  onClick={handleVinDecode} 
                  disabled={vinLoading || vin.length !== 17}
                  className="w-full"
                >
                  {vinLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Decode VIN
                </Button>
              </CardContent>
            </Card>

            {vinResult && (
              <Card className="border-primary/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">
                        {vinResult.year} {vinResult.make} {vinResult.model}
                      </h3>
                      {vinResult.engine && (
                        <p className="text-sm text-muted-foreground">{vinResult.engine}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Oil Specs Tab */}
          <TabsContent value="oil" className="space-y-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Droplet className="h-4 w-4" />
                  Oil Specifications Lookup
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Year</Label>
                    <Select value={oilYear} onValueChange={setOilYear}>
                      <SelectTrigger>
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Make</Label>
                    <Input
                      value={oilMake}
                      onChange={(e) => setOilMake(e.target.value)}
                      placeholder="Toyota"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Model (optional)</Label>
                  <Input
                    value={oilModel}
                    onChange={(e) => setOilModel(e.target.value)}
                    placeholder="Camry"
                  />
                </div>
                <Button 
                  onClick={handleOilSearch} 
                  disabled={oilLoading}
                  className="w-full"
                >
                  {oilLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Search Specs
                </Button>
              </CardContent>
            </Card>

            {oilResults.length > 0 && (
              <div className="space-y-3">
                {oilResults.map((spec) => (
                  <Card key={spec.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <Car className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <h3 className="font-medium">
                            {spec.year} {spec.make} {spec.model}
                          </h3>
                          {spec.engine && (
                            <p className="text-xs text-muted-foreground">{spec.engine}</p>
                          )}
                        </div>
                      </div>
                      <Separator className="my-2" />
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {spec.oil_type && (
                          <>
                            <span className="text-muted-foreground">Oil Type</span>
                            <span className="font-medium">{spec.oil_type}</span>
                          </>
                        )}
                        {spec.oil_capacity && (
                          <>
                            <span className="text-muted-foreground">Capacity</span>
                            <span className="font-medium">{spec.oil_capacity}</span>
                          </>
                        )}
                        {spec.oil_filter && (
                          <>
                            <span className="text-muted-foreground">Oil Filter</span>
                            <span className="font-medium">{spec.oil_filter}</span>
                          </>
                        )}
                        {spec.drain_plug_torque && (
                          <>
                            <span className="text-muted-foreground">Drain Plug</span>
                            <span className="font-medium">{spec.drain_plug_torque}</span>
                          </>
                        )}
                        {spec.air_filter && (
                          <>
                            <span className="text-muted-foreground">Air Filter</span>
                            <span className="font-medium">{spec.air_filter}</span>
                          </>
                        )}
                        {spec.cabin_filter && (
                          <>
                            <span className="text-muted-foreground">Cabin Filter</span>
                            <span className="font-medium">{spec.cabin_filter}</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Filter Cross-Reference Tab */}
          <TabsContent value="filters" className="space-y-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filter Cross-Reference
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <div>
                  <Label className="text-xs">Part Number (any brand)</Label>
                  <Input
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value.toUpperCase())}
                    placeholder="PH7317, 51348, etc."
                  />
                </div>
                <Button 
                  onClick={handleFilterSearch} 
                  disabled={filterLoading}
                  className="w-full"
                >
                  {filterLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Find Cross-References
                </Button>
              </CardContent>
            </Card>

            {filterResults.length > 0 && (
              <div className="space-y-3">
                {filterResults.map((filter) => (
                  <Card key={filter.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline">{filter.filter_type}</Badge>
                        {filter.oem_part_number && (
                          <Badge variant="secondary">OEM: {filter.oem_part_number}</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {filter.fram_part_number && (
                          <>
                            <span className="text-muted-foreground">Fram</span>
                            <span className="font-medium">{filter.fram_part_number}</span>
                          </>
                        )}
                        {filter.wix_part_number && (
                          <>
                            <span className="text-muted-foreground">Wix</span>
                            <span className="font-medium">{filter.wix_part_number}</span>
                          </>
                        )}
                        {filter.mobil1_part_number && (
                          <>
                            <span className="text-muted-foreground">Mobil 1</span>
                            <span className="font-medium">{filter.mobil1_part_number}</span>
                          </>
                        )}
                        {filter.k_and_n_part_number && (
                          <>
                            <span className="text-muted-foreground">K&N</span>
                            <span className="font-medium">{filter.k_and_n_part_number}</span>
                          </>
                        )}
                        {filter.bosch_part_number && (
                          <>
                            <span className="text-muted-foreground">Bosch</span>
                            <span className="font-medium">{filter.bosch_part_number}</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
