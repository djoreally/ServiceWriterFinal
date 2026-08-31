/**
 * WheelTireConfigurator — the tire-vertical vehicle selector.
 *
 * Flow: Year -> Make -> Model resolves the OE tire size(s) from
 * vehicle_specifications, the customer confirms the OE size or overrides it.
 * No oil / fluid information is ever surfaced here.
 */
import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CircleDot, Check, Pencil } from "lucide-react";
import { useVehicleSpecs } from "@/hooks/useVehicleSpecs";
import { fetchExactVehicleSpecifications } from "@/application/queries/vehicle-specifications.query";
import { TIRE_SIZE_PATTERN } from "@/lib/booking-requirements";

export interface WheelTireSelection {
  year: string;
  make: string;
  model: string;
  tireSize: string;
  rearTireSize?: string;
  /** "oe" when taken from the spec database, "manual" when typed by the user. */
  tireSizeSource?: "oe" | "manual";
}

interface Props {
  value: WheelTireSelection;
  onChange: (next: Partial<WheelTireSelection>) => void;
  /** Optional label shown above the block. */
  title?: string;
  showVehicleSelectors?: boolean;
}

const generateYears = () => {
  const years: string[] = [];
  for (let y = new Date().getFullYear() + 1; y >= 1990; y--) years.push(String(y));
  return years;
};

export function WheelTireConfigurator({ value, onChange, title = "Vehicle & tire size", showVehicleSelectors = true }: Props) {
  const { makes, models, loading: specsLoading } = useVehicleSpecs({
    year: value.year,
    make: value.make,
    model: value.model,
  });

  const [oeSizes, setOeSizes] = useState<string[]>([]);
  const [oeLoading, setOeLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const yearOptions = useMemo(() => generateYears(), []);

  useEffect(() => {
    let cancelled = false;
    const { year, make, model } = value;
    if (!year || !make || !model) {
      void Promise.resolve().then(() => setOeSizes([]));
      return;
    }
    void Promise.resolve().then(() => setOeLoading(true));
    void Promise.resolve().then(() => fetchExactVehicleSpecifications(Number(year), make, model, "tire_size")
      .then((rows) => {
        if (cancelled) return;
        const sizes = Array.from(
          new Set(
            rows
              .map((row) => String((row as { tire_size?: string | null }).tire_size ?? "").trim())
              .filter((size) => size.length > 0),
          ),
        );
        setOeSizes(sizes);
        if (sizes.length === 1 && !value.tireSize) {
          onChange({ tireSize: sizes[0], tireSizeSource: "oe" });
        }
      })
      .finally(() => {
        if (!cancelled) setOeLoading(false);
      }));
    return () => {
      cancelled = true;
    };

  }, [value.year, value.make, value.model, value, onChange]);

  const manualInvalid =
    manualMode && value.tireSize.trim().length > 0 && !TIRE_SIZE_PATTERN.test(value.tireSize.trim());

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CircleDot className="h-4 w-4 text-primary" />
        {title}
      </div>

      {showVehicleSelectors && <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label>Year *</Label>
          <Select
            value={value.year}
            onValueChange={(year) => onChange({ year, make: "", model: "", tireSize: "", tireSizeSource: undefined })}
          >
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

        <div>
          <Label>Make *</Label>
          <Select
            value={value.make}
            onValueChange={(make) => onChange({ make, model: "", tireSize: "", tireSizeSource: undefined })}
            disabled={!value.year || specsLoading}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={value.year ? "Select make" : "Select year first"} />
            </SelectTrigger>
            <SelectContent>
              {makes.map((make) => (
                <SelectItem key={make} value={make}>
                  {make}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Model *</Label>
          <Select
            value={value.model}
            onValueChange={(model) => onChange({ model, tireSize: "", tireSizeSource: undefined })}
            disabled={!value.make}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={value.make ? "Select model" : "Select make first"} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>}

      {/* Tire size confirm / override */}
      <div className="rounded-lg border p-4 space-y-3">
        {oeLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking up factory tire size…
          </p>
        ) : (
          <>
            {oeSizes.length > 0 && !manualMode && (
              <div className="space-y-2">
                <Label>Factory tire size</Label>
                <div className="flex flex-wrap gap-2">
                  {oeSizes.map((size) => {
                    const active = value.tireSize === size;
                    return (
                      <Button
                        key={size}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="gap-2 font-mono"
                        onClick={() => onChange({ tireSize: size, tireSizeSource: "oe" })}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                        {size}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Confirm the size on your door jamb sticker — plus-sized or replacement wheels may differ.
                </p>
              </div>
            )}

            {oeSizes.length === 0 && value.model && !manualMode && (
              <p className="text-sm text-muted-foreground">
                No factory tire size on file for this vehicle — enter the size from your tire sidewall.
              </p>
            )}

            {(manualMode || oeSizes.length === 0) && (
              <div>
                <Label>Tire size {oeSizes.length === 0 ? "*" : "(override)"}</Label>
                <Input
                  value={value.tireSize}
                  onChange={(e) =>
                    onChange({ tireSize: e.target.value.toUpperCase(), tireSizeSource: "manual" })
                  }
                  placeholder="e.g. 225/65R17"
                  className="mt-1 font-mono"
                />
                {manualInvalid && (
                  <p className="mt-1 text-xs text-destructive">
                    Use the sidewall format, e.g. 225/65R17 or LT265/70R17.
                  </p>
                )}
              </div>
            )}

            {oeSizes.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => setManualMode((prev) => !prev)}
              >
                <Pencil className="h-3.5 w-3.5" />
                {manualMode ? "Use factory size" : "My tires are a different size"}
              </Button>
            )}

            {value.tireSize && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Selected:</span>
                <Badge variant="secondary" className="font-mono">
                  {value.tireSize}
                </Badge>
                <Badge variant="outline">{value.tireSizeSource === "manual" ? "Customer entered" : "Factory"}</Badge>
              </div>
            )}
          </>
        )}
      </div>
      {value.tireSize && (
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <div><Label>Front size</Label><Input value={value.tireSize} readOnly className="mt-1 font-mono" /></div>
          <div><Label>Rear size <span className="font-normal text-muted-foreground">(only if staggered)</span></Label><Input value={value.rearTireSize || ""} onChange={(e) => onChange({ rearTireSize: e.target.value.toUpperCase() })} placeholder="Same as front" className="mt-1 font-mono" /></div>
        </div>
      )}
    </div>
  );
}
