import { useState, useEffect } from "react";
import { fetchVehicleRepairs, type RepairItem } from "@/application/queries/vehicle-repairs.query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import {
  Wrench,
  Search,
  DollarSign,
  ShieldAlert,
  AlertCircle,
  Scale,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Info
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface VehicleRepairsProps {
  vin: string | null;
  businessId?: string;
  vehicleName: string;
}

export const VehicleRepairs = ({ vin, businessId, vehicleName }: VehicleRepairsProps) => {
  const { formatCurrency } = useRegionalSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepair, setSelectedRepair] = useState<RepairItem | null>(null);
  const [source, setSource] = useState<"cache" | "upstream" | null>(null);

  const loadRepairs = async () => {
    if (!vin || vin.length !== 17) {
      setError("A valid 17-character VIN is required to pull repair cost intelligence.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetchVehicleRepairs(vin, businessId);
      if (response.success && response.repair) {
        setRepairs(response.repair);
        setSource(response.source);
        if (response.repair.length > 0) {
          setSelectedRepair(response.repair[0]);
        }
      } else {
        setError(response.error || "No repair details found for this vehicle.");
      }
    } catch (err: any) {
      console.error("Failed to load vehicle repairs:", err);
      setError(err?.message || "Failed to load repairs intelligence from the API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vin && vin.length === 17) {
      loadRepairs();
    } else {
      setError("Please ensure the vehicle profile has a valid 17-character VIN configured.");
    }
  }, [vin]);

  const filteredRepairs = repairs.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCost = (item: RepairItem, type: "independent" | "dealer", name: "part" | "labor" | "total") => {
    const list = type === "independent" ? item.costs.independent : item.costs.dealer;
    return list.find((c) => c.name === name);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Market Repair Intelligence
          </h3>
          <p className="text-sm text-muted-foreground">
            Real-time independent and dealer cost metrics for {vehicleName} (VIN: <span className="font-mono">{vin || "Not Set"}</span>)
          </p>
        </div>
        {vin && vin.length === 17 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={loadRepairs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Intelligence
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 border-border/50">
            <CardHeader className="pb-3">
              <Skeleton className="h-10 w-full" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader>
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-6">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : error ? (
        <Card className="border-dashed border-red-200 bg-red-50/50">
          <CardContent className="py-8 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
            <div className="h-12 w-12 rounded-md bg-red-100 flex items-center justify-center text-red-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-red-900">Repair Lookup Unavailable</h4>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            {vin && vin.length === 17 && (
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={loadRepairs}>
                Try Again
              </Button>
            )}
          </CardContent>
        </Card>
      ) : repairs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
            <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
              <Wrench className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold">No repair logs returned</h4>
              <p className="text-sm text-muted-foreground">
                Upstream provider has no estimated repairs catalog for this specific model configuration.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Repairs List panel */}
          <Card className="lg:col-span-1 border-border/50 max-h-[600px] flex flex-col overflow-hidden">
            <CardHeader className="pb-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter repair types..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Showing {filteredRepairs.length} of {repairs.length} repairs</span>
                {source && (
                  <Badge variant="outline" className="text-[10px] capitalize font-medium">
                    Source: {source}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto flex-1 divide-y divide-border/40">
              {filteredRepairs.map((item) => {
                const isSelected = selectedRepair?.title === item.title;
                const indTotal = getCost(item, "independent", "total");
                const dealerTotal = getCost(item, "dealer", "total");
                return (
                  <button
                    key={item.title}
                    onClick={() => setSelectedRepair(item)}
                    className={`w-full text-left p-4 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 ${
                      isSelected ? "bg-primary/5 border-l-2 border-primary" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {indTotal ? `Indie: ${formatCurrency(indTotal.average)}` : "Indie: —"}
                        {" · "}
                        {dealerTotal ? `Dealer: ${formatCurrency(dealerTotal.average)}` : "Dealer: —"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Repair Details Panel */}
          {selectedRepair && (
            <Card className="lg:col-span-2 border-border/50 flex flex-col justify-between">
              <div>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-xl">{selectedRepair.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Vehicle specific repair overview and price bounds
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="gap-1.5 py-1 px-2 text-xs">
                      <Wrench className="h-3.5 w-3.5" />
                      Estimating Template Available
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {selectedRepair.description && selectedRepair.description !== "N/A" && (
                    <div className="bg-muted/40 p-4 rounded-lg text-sm text-muted-foreground border border-border/40 relative">
                      <div className="flex items-start gap-2.5">
                        <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <p className="leading-relaxed">{selectedRepair.description}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Independent Shop Costs */}
                    <div className="rounded-xl border border-border/60 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b pb-3 border-border/40">
                        <span className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                          <Scale className="h-4 w-4 text-primary" />
                          Independent Shop Averages
                        </span>
                        <Badge variant="outline" className="bg-primary/[0.02] text-primary border-primary/20 text-xs">
                          Value Pricing
                        </Badge>
                      </div>

                      <div className="space-y-4">
                        {["part", "labor", "total"].map((partName) => {
                          const cost = getCost(selectedRepair, "independent", partName as any);
                          if (!cost) return null;
                          return (
                            <div key={partName} className="space-y-1.5">
                              <div className="flex justify-between text-xs text-muted-foreground capitalize">
                                <span>{partName}</span>
                                <span className="font-medium text-foreground">{formatCurrency(cost.average)}</span>
                              </div>
                              <div className="relative h-2 w-full bg-muted rounded-md overflow-hidden">
                                <div
                                  className="absolute h-full bg-primary rounded-md"
                                  style={{ width: `${Math.min(100, (cost.average / (cost.high || 1)) * 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-muted-foreground/80">
                                <span>Low: {formatCurrency(cost.low)}</span>
                                <span>High: {formatCurrency(cost.high)}</span>
                              </div>
                            </div>
                          );
                        })}
                        {!getCost(selectedRepair, "independent", "total") && (
                          <p className="text-xs text-muted-foreground italic py-4 text-center">
                            No independent average data available for this repair.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Dealership Costs */}
                    <div className="rounded-xl border border-border/60 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b pb-3 border-border/40">
                        <span className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                          <ShieldAlert className="h-4 w-4 text-orange-500" />
                          Dealership Pricing
                        </span>
                        <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200 text-xs">
                          Premium Margins
                        </Badge>
                      </div>

                      <div className="space-y-4">
                        {["part", "labor", "total"].map((partName) => {
                          const cost = getCost(selectedRepair, "dealer", partName as any);
                          if (!cost) return null;
                          return (
                            <div key={partName} className="space-y-1.5">
                              <div className="flex justify-between text-xs text-muted-foreground capitalize">
                                <span>{partName}</span>
                                <span className="font-medium text-foreground">{formatCurrency(cost.average)}</span>
                              </div>
                              <div className="relative h-2 w-full bg-muted rounded-md overflow-hidden">
                                <div
                                  className="absolute h-full bg-orange-500 rounded-md"
                                  style={{ width: `${Math.min(100, (cost.average / (cost.high || 1)) * 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-muted-foreground/80">
                                <span>Low: {formatCurrency(cost.low)}</span>
                                <span>High: {formatCurrency(cost.high)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </div>

              <div className="p-6 border-t border-border/50 bg-muted/20 flex flex-wrap items-center justify-between gap-4 rounded-b-lg">
                <div className="text-xs text-muted-foreground">
                  Use these ranges as reference values in our <strong>Smart Quote Builder</strong>.
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const cost = getCost(selectedRepair, "independent", "total");
                      if (cost) {
                        toast.success(`Copied average indie total of ${formatCurrency(cost.average)} to quote clipboard!`);
                      }
                    }}
                  >
                    Use Independent Average
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const cost = getCost(selectedRepair, "dealer", "total");
                      if (cost) {
                        toast.success(`Copied average dealer total of ${formatCurrency(cost.average)} to quote clipboard!`);
                      }
                    }}
                  >
                    Use Dealer Average
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
