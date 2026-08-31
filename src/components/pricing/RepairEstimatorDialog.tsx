import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchVehicleRepairs, type RepairItem } from "@/application/queries/vehicle-repairs.query";
import {
  buildQuoteLinesFromRepair,
  extractRepairCosts,
  type EstimateLine,
  type PricingTier,
} from "@/domain/pricing/repair-estimate";

export interface RepairEstimatorApplyPayload {
  repair: RepairItem;
  tier: PricingTier;
  lines: EstimateLine[];
  laborHours: number;
  laborCost: number;
  costs: ReturnType<typeof extractRepairCosts>;
}

interface RepairEstimatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 17-character VIN of the vehicle being estimated. */
  vin?: string | null;
  /** Tenant workspace id, for API cost attribution. */
  businessId?: string;
  /** Shop hourly labor rate in dollars. */
  laborRate?: number;
  /** Optional parts markup (0.2 = +20%). */
  partsMarkup?: number;
  /** Called when the user applies a repair at a tier. */
  onApply: (payload: RepairEstimatorApplyPayload) => void;
  title?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

/**
 * Reusable market repair estimator. Single fetch/error/apply surface shared by
 * Quotes, Services, Service Catalog and Fleet work orders — do not duplicate.
 */
export function RepairEstimatorDialog({
  open,
  onOpenChange,
  vin,
  businessId,
  laborRate,
  partsMarkup,
  onApply,
  title = "Market Repairs Price Estimator",
}: RepairEstimatorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [search, setSearch] = useState("");
  const [loadedVin, setLoadedVin] = useState<string | null>(null);

  const cleanVin = useMemo(() => (vin || "").replace(/\s/g, "").toUpperCase(), [vin]);

  const load = useCallback(async () => {
    if (cleanVin.length !== 17) {
      setError("This vehicle needs a valid 17-character VIN before we can pull market pricing.");
      setRepairs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchVehicleRepairs(cleanVin, businessId);
      if (response.success && Array.isArray(response.repair)) {
        setRepairs(response.repair);
        setLoadedVin(cleanVin);
        if (response.repair.length === 0) {
          setError("No market repair records exist for this vehicle yet.");
        }
      } else {
        setRepairs([]);
        setError(response.error || "No repair details found for this vehicle.");
      }
    } catch (err) {
      setRepairs([]);
      setError((err as Error)?.message || "Failed to load market pricing.");
    } finally {
      setLoading(false);
    }
  }, [cleanVin, businessId]);

  useEffect(() => {
    if (!open) return;
    if (loadedVin === cleanVin && repairs.length > 0) return;
    void Promise.resolve().then(() => load());
  }, [open, cleanVin, loadedVin, repairs.length, load]);

  const handleApply = (repair: RepairItem, tier: PricingTier) => {
    const built = buildQuoteLinesFromRepair(repair, tier, { laborRate, partsMarkup });
    onApply({ repair, tier, ...built });
    onOpenChange(false);
  };

  const filtered = repairs.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search repair catalog (e.g. Alternator, Starter)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading market price records...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center max-w-sm mx-auto space-y-3">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm font-semibold">Could not load pricing</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              {cleanVin.length === 17 && (
                <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                  Try again
                </Button>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-border/40 border rounded-lg bg-card">
              {filtered.map((item) => {
                const indie = extractRepairCosts(item, "independent");
                const dealer = extractRepairCosts(item, "dealer");
                return (
                  <div
                    key={item.title}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground">{item.title}</p>
                      {item.description && item.description !== "N/A" && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {indie.totalAvg > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            Indie range {fmt(indie.totalLow)}–{fmt(indie.totalHigh)}
                          </Badge>
                        )}
                        {dealer.totalAvg > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            Dealer range {fmt(dealer.totalLow)}–{fmt(dealer.totalHigh)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {indie.totalAvg > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => handleApply(item, "independent")}
                        >
                          Indie avg ({fmt(indie.totalAvg)})
                        </Button>
                      )}
                      {dealer.totalAvg > 0 && (
                        <Button type="button" size="sm" className="text-xs" onClick={() => handleApply(item, "dealer")}>
                          Dealer avg ({fmt(dealer.totalAvg)})
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">No repairs match that search.</div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default RepairEstimatorDialog;
