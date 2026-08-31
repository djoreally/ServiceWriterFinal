/**
 * VehicleYMMSelector — canonical Year/Make/Model/Engine selector.
 *
 * Primary path: dropdowns backed by `useVehicleSpecs` / `vehicle_specifications`.
 * Fallback path: "Enter manually" toggle exposes free-text inputs so shops can
 * add pre-1990 vehicles, heavy-duty trucks, or any YMM missing from the catalog
 * without losing the ability to save.
 */
import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVehicleSpecs } from "@/hooks/useVehicleSpecs";
import { Loader2 } from "lucide-react";

export interface VehicleYMMValue {
  year: string;
  make: string;
  model: string;
  engine?: string;
}

interface Props {
  value: VehicleYMMValue;
  onChange: (next: VehicleYMMValue) => void;
  required?: boolean;
  showEngine?: boolean;
  minYear?: number;
  maxYear?: number;
  className?: string;
}

const buildYears = (min = 1990, max = new Date().getFullYear() + 1) => {
  const out: string[] = [];
  for (let y = max; y >= min; y--) out.push(String(y));
  return out;
};

export function VehicleYMMSelector({
  value,
  onChange,
  required,
  showEngine = false,
  minYear,
  maxYear,
  className,
}: Props) {
  const { makes, models, engines, loading, years: catalogYears } = useVehicleSpecs({
    year: value.year || undefined,
    make: value.make || undefined,
    model: value.model || undefined,
  });

  const years = useMemo(() => {
    if (catalogYears && catalogYears.length > 0) {
      const sorted = [...catalogYears].sort((a, b) => b - a).map(String);
      if (minYear || maxYear) {
        return sorted.filter((y) => {
          const n = parseInt(y);
          if (minYear && n < minYear) return false;
          if (maxYear && n > maxYear) return false;
          return true;
        });
      }
      return sorted;
    }
    return buildYears(minYear, maxYear);
  }, [catalogYears, minYear, maxYear]);

  // Detect off-catalog values (existing vehicle with make/model not in catalog).
  // If the current make/model isn't present in the catalog options, auto-flip to
  // manual mode so editing doesn't wipe the fields.
  const valueLooksOffCatalog = useMemo(() => {
    if (!value.year && !value.make && !value.model) return false;
    if (value.year && catalogYears && catalogYears.length > 0) {
      const yn = parseInt(value.year);
      if (!catalogYears.includes(yn)) return true;
    }
    if (value.make && makes.length > 0 && !makes.some((m) => m.toLowerCase() === value.make.toLowerCase())) {
      return true;
    }
    if (value.model && models.length > 0 && !models.some((m) => m.toLowerCase() === value.model.toLowerCase())) {
      return true;
    }
    return false;
  }, [value, catalogYears, makes, models]);

  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (valueLooksOffCatalog) void Promise.resolve().then(() => setManual(true));
  }, [valueLooksOffCatalog]);

  const req = required ? " *" : "";

  if (manual) {
    return (
      <div className={`space-y-3 ${className ?? ""}`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Year{req}</Label>
            <Input
              inputMode="numeric"
              placeholder="e.g. 1988"
              value={value.year}
              onChange={(e) => onChange({ ...value, year: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Make{req}</Label>
            <Input
              placeholder="Make"
              value={value.make}
              onChange={(e) => onChange({ ...value, make: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Model{req}</Label>
            <Input
              placeholder="Model"
              value={value.model}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
            />
          </div>
          {showEngine && (
            <div className="space-y-2 sm:col-span-3">
              <Label>Engine</Label>
              <Input
                placeholder="Engine (optional)"
                value={value.engine ?? ""}
                onChange={(e) => onChange({ ...value, engine: e.target.value })}
              />
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setManual(false)}
          >
            Use catalog dropdown
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Year{req}</Label>
          <Select
            value={value.year || undefined}
            onValueChange={(y) => onChange({ year: y, make: "", model: "", engine: "" })}
          >
            <SelectTrigger><SelectValue placeholder={loading && years.length === 0 ? "Loading…" : "Select year"} /></SelectTrigger>
            <SelectContent className="max-h-72">
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Make{req}</Label>
          <Select
            value={value.make || undefined}
            onValueChange={(m) => onChange({ ...value, make: m, model: "", engine: "" })}
            disabled={!value.year || loading}
          >
            <SelectTrigger>
              <SelectValue placeholder={!value.year ? "Pick year first" : loading ? "Loading…" : "Select make"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {makes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Model{req}</Label>
          <Select
            value={value.model || undefined}
            onValueChange={(mo) => onChange({ ...value, model: mo, engine: "" })}
            disabled={!value.make}
          >
            <SelectTrigger>
              <SelectValue placeholder={!value.make ? "Pick make first" : "Select model"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {showEngine && engines.length > 0 && (
          <div className="space-y-2 sm:col-span-3">
            <Label>Engine</Label>
            <Select
              value={value.engine || undefined}
              onValueChange={(e) => onChange({ ...value, engine: e })}
            >
              <SelectTrigger><SelectValue placeholder="Select engine" /></SelectTrigger>
              <SelectContent>
                {engines.map((e) => <SelectItem key={e.engine} value={e.engine}>{e.engine}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {loading && !value.make && value.year && (
          <div className="sm:col-span-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading catalog…
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setManual(true)}
        >
          Can't find it? Enter manually
        </Button>
      </div>
    </div>
  );
}
