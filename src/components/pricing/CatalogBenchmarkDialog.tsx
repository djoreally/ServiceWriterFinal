import { useState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveCatalogBenchmark } from "@/application/queries/repair-pricing.query";
import { RepairEstimatorDialog, type RepairEstimatorApplyPayload } from "@/components/pricing/RepairEstimatorDialog";
import { extractRepairCosts, marketPosition } from "@/domain/pricing/repair-estimate";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
interface CatalogBenchmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceCatalogId: string;
  serviceName: string;
  shopPrice: number;
  onSaved?: () => void;
  /** Called with a suggested price when the user accepts the market average. */
  onSuggestPrice?: (price: number) => void;
}

/**
 * Benchmarks one catalog service against market pricing for a representative
 * VIN, then stores the snapshot so the catalog can show positioning without
 * re-billing the upstream API.
 */
export function CatalogBenchmarkDialog({
  open,
  onOpenChange,
  serviceCatalogId,
  serviceName,
  shopPrice,
  onSaved,
  onSuggestPrice,
}: CatalogBenchmarkDialogProps) {
  const [vin, setVin] = useState("");
  const [estimatorOpen, setEstimatorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const cleanVin = vin.replace(/\s/g, "").toUpperCase();

  const handleApply = async ({ repair }: RepairEstimatorApplyPayload) => {
    const indie = extractRepairCosts(repair, "independent");
    const dealer = extractRepairCosts(repair, "dealer");

    setSaving(true);
    try {
      const { data: { user } } = await getCurrentAuthUser();
      if (!user) {
        toast.error("You need to be signed in to save a benchmark.");
        return;
      }

      const { error } = await saveCatalogBenchmark({
        userId: user.id,
        serviceCatalogId,
        vin: cleanVin || null,
        vehicleLabel: null,
        repairTitle: repair.title,
        independent: { low: indie.totalLow, avg: indie.totalAvg, high: indie.totalHigh },
        dealer: { low: dealer.totalLow, avg: dealer.totalAvg, high: dealer.totalHigh },
        shopPrice: shopPrice || null,
      });

      if (error) {
        toast.error("Could not save the benchmark.");
        return;
      }

      const position = marketPosition(shopPrice, indie.totalAvg);
      toast.success(
        position
          ? `Benchmarked ${serviceName}: you are ${position.label === "at" ? "at market" : `${Math.abs(position.percent)}% ${position.label} market`}.`
          : `Benchmarked ${serviceName}.`,
      );
      onSuggestPrice?.(indie.totalAvg);
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Benchmark “{serviceName}”
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter a representative 17-character VIN for the vehicles you usually service. We'll compare your price
              against independent and dealer market averages.
            </p>
            <div className="space-y-2">
              <Label htmlFor="benchmark-vin">Representative VIN</Label>
              <Input
                id="benchmark-vin"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder="1HGCM82633A004352"
                maxLength={17}
                className="font-mono uppercase"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={cleanVin.length !== 17 || saving}
                onClick={() => setEstimatorOpen(true)}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pull market pricing"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RepairEstimatorDialog
        open={estimatorOpen}
        onOpenChange={setEstimatorOpen}
        vin={cleanVin}
        title={`Match “${serviceName}” to a market repair`}
        onApply={handleApply}
      />
    </>
  );
}

export default CatalogBenchmarkDialog;
