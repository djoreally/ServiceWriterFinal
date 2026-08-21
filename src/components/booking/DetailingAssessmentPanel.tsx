/**
 * DetailingAssessmentPanel - Shared detailing assessment questions.
 *
 * Rendered wherever a selected service carries the `detailing_assessment`
 * requirement. Previously these fields only existed inside the vehicle step,
 * which could not know that a detail service would be selected later — so the
 * requirement was impossible to satisfy and blocked the flow.
 */

import { useEffect } from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { VehicleData } from "@/components/booking/VehicleEntry";
import { resolveDetailingRule, type DetailingPricingRule } from "@/lib/detailing-pricing";
import { uploadBookingAssessmentPhoto } from "@/application/commands/booking-assessment.command";

interface DetailingAssessmentPanelProps {
  vehicle: VehicleData;
  detailingRules?: DetailingPricingRule[];
  businessUserId?: string;
  onChange: (patch: Partial<VehicleData>) => void;
}

export function DetailingAssessmentPanel({
  vehicle,
  detailingRules = [],
  businessUserId,
  onChange,
}: DetailingAssessmentPanelProps) {
  const rule = resolveDetailingRule(detailingRules, vehicle);

  // Keep derived requirement flags in sync with the resolved pricing rule.
  useEffect(() => {
    if (!rule) return;
    const photoRequired = rule.photoRequired || vehicle.detailingBiohazard === true;
    const quoteRequired = rule.quoteRequired || vehicle.detailingBiohazard === true;
    if (
      vehicle.detailingPhotoRequired !== photoRequired ||
      vehicle.detailingQuoteRequired !== quoteRequired ||
      vehicle.detailingWaterRequired !== rule.requiresWater ||
      vehicle.detailingPowerRequired !== rule.requiresPower ||
      vehicle.detailingCoveredAreaRequired !== rule.requiresCoveredArea ||
      vehicle.detailingPriceMultiplier !== rule.priceMultiplier ||
      vehicle.detailingDurationMultiplier !== rule.durationMultiplier ||
      vehicle.detailingFlatFee !== rule.flatFee
    ) {
      onChange({
        detailingPhotoRequired: photoRequired,
        detailingQuoteRequired: quoteRequired,
        detailingWaterRequired: rule.requiresWater,
        detailingPowerRequired: rule.requiresPower,
        detailingCoveredAreaRequired: rule.requiresCoveredArea,
        detailingPriceMultiplier: rule.priceMultiplier,
        detailingDurationMultiplier: rule.durationMultiplier,
        detailingFlatFee: rule.flatFee,
      });
    }
  }, [rule, vehicle, onChange]);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Detailing assessment</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Vehicle size *</Label>
          <Select
            value={vehicle.detailingVehicleSize || ""}
            onValueChange={(value) => onChange({ detailingVehicleSize: value as VehicleData["detailingVehicleSize"] })}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select size" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Car / compact</SelectItem>
              <SelectItem value="midsize">Midsize SUV / truck</SelectItem>
              <SelectItem value="large">3-row SUV / full-size truck</SelectItem>
              <SelectItem value="oversize">Van / oversized</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Current condition *</Label>
          <Select
            value={vehicle.detailingCondition || ""}
            onValueChange={(value) => onChange({ detailingCondition: value as VehicleData["detailingCondition"] })}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select condition" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light maintenance clean</SelectItem>
              <SelectItem value="moderate">Moderate soil / stains</SelectItem>
              <SelectItem value="heavy">Heavy soil / pet hair / odor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Your provider will confirm condition and final pricing before work begins.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            checked={vehicle.detailingMobileAccessConfirmed || false}
            onCheckedChange={(checked) => onChange({ detailingMobileAccessConfirmed: checked === true })}
          />
          There is safe mobile-service access
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            checked={vehicle.detailingPetHair || false}
            onCheckedChange={(checked) => onChange({ detailingPetHair: checked === true })}
          />
          Pet hair requires removal
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            checked={vehicle.detailingBiohazard || false}
            onCheckedChange={(checked) => onChange({ detailingBiohazard: checked === true, detailingQuoteRequired: checked === true, detailingPhotoRequired: checked === true })}
          />
          Mold, bodily fluids, or hazardous contamination
        </label>
        {rule?.requiresWater && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={vehicle.detailingHasWater || false} onCheckedChange={(checked) => onChange({ detailingHasWater: checked === true })} />
            Water hookup is available
          </label>
        )}
        {rule?.requiresPower && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={vehicle.detailingHasPower || false} onCheckedChange={(checked) => onChange({ detailingHasPower: checked === true })} />
            Power outlet is available
          </label>
        )}
        {rule?.requiresCoveredArea && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={vehicle.detailingHasCoveredArea || false} onCheckedChange={(checked) => onChange({ detailingHasCoveredArea: checked === true })} />
            Covered work area is available
          </label>
        )}
      </div>
      {(rule?.photoRequired || vehicle.detailingPhotoRequired) && (
        <div className="rounded-md bg-amber-50 p-3">
          <Label>Condition photo required *</Label>
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-2"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file || !businessUserId) return;
              try {
                const url = await uploadBookingAssessmentPhoto(businessUserId, vehicle.id, file);
                onChange({ detailingPhotos: [...(vehicle.detailingPhotos || []), url], detailingPhotoRequired: true });
                toast.success("Assessment photo added");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Photo upload failed");
              }
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">{vehicle.detailingPhotos?.length || 0} photo(s) added</p>
        </div>
      )}
      {(rule?.quoteRequired || vehicle.detailingQuoteRequired) && (
        <Alert className="border-amber-300 bg-amber-50">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Quote required.</strong> The displayed amount is a starting estimate. The provider will confirm scope and final price before service.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
