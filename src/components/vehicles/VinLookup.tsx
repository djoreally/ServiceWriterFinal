import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Car, CheckCircle2, AlertCircle } from "lucide-react";
import { lookupVin, type VinLookupResult } from "@/application/queries/vin-lookup.query";
import { toast } from "@/components/ui/sonner";

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "District of Columbia" },
];

const CANADIAN_PROVINCES = [
  { code: "AB", name: "Alberta" }, { code: "BC", name: "British Columbia" }, { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" }, { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" }, { code: "ON", name: "Ontario" }, { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" }, { code: "SK", name: "Saskatchewan" },
];

// VinLookupResult imported from application layer

interface VinLookupProps {
  onVinFound: (result: VinLookupResult) => void;
  licensePlate?: string;
  plateState?: string;
  onPlateChange?: (plate: string) => void;
  onStateChange?: (state: string) => void;
}

export function VinLookup({ 
  onVinFound, 
  licensePlate = "", 
  plateState = "", 
  onPlateChange,
  onStateChange 
}: VinLookupProps) {
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<VinLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPlate, setLocalPlate] = useState(licensePlate);
  const [localState, setLocalState] = useState(plateState);

  const allRegions = [...US_STATES, ...CANADIAN_PROVINCES];

  const handleSearch = async () => {
    const plate = onPlateChange ? licensePlate : localPlate;
    const state = onStateChange ? plateState : localState;

    if (!plate || !state) {
      toast.error("Please enter license plate and state/province");
      return;
    }

    setSearching(true);
    setError(null);
    setResult(null);

    try {
      const vehicleResult = await lookupVin(plate, state);
      setResult(vehicleResult);
      onVinFound(vehicleResult);
      toast.success("Vehicle found!");
    } catch (err: any) {
      console.error("VIN lookup error:", err);
      const msg = err.message || "Failed to lookup VIN";
      setError(msg);
      toast.error(msg);
    }

    setSearching(false);
  };

  const handlePlateInputChange = (value: string) => {
    const upperValue = value.toUpperCase();
    if (onPlateChange) {
      onPlateChange(upperValue);
    } else {
      setLocalPlate(upperValue);
    }
  };

  const handleStateInputChange = (value: string) => {
    if (onStateChange) {
      onStateChange(value);
    } else {
      setLocalState(value);
    }
  };

  const currentPlate = onPlateChange ? licensePlate : localPlate;
  const currentState = onStateChange ? plateState : localState;

  return (
    <Card className="border-dashed border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Car className="h-4 w-4" />
          QuickVIN Lookup
        </div>
        
        <p className="text-xs text-muted-foreground">
          Enter license plate and state to automatically lookup VIN and vehicle details
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">License Plate</Label>
            <Input
              value={currentPlate}
              onChange={(e) => handlePlateInputChange(e.target.value)}
              placeholder="ABC1234"
              className="uppercase"
              maxLength={10}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">State/Province</Label>
            <Select value={currentState} onValueChange={handleStateInputChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">United States</div>
                {US_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>{s.code} - {s.name}</SelectItem>
                ))}
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Canada</div>
                {CANADIAN_PROVINCES.map((p) => (
                  <SelectItem key={p.code} value={p.code}>{p.code} - {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button 
              onClick={handleSearch} 
              disabled={searching || !currentPlate || !currentState}
              className="w-full gap-2"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Lookup VIN
            </Button>
          </div>
        </div>

        {result && (
          <div className="p-3 rounded-lg bg-gray-500/10 border border-gray-500/20 space-y-2">
            <div className="flex items-center gap-2 text-gray-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium text-sm">Vehicle Found</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">VIN:</span> <span className="font-mono">{result.vin}</span></div>
              <div><span className="text-muted-foreground">Year:</span> {result.year}</div>
              <div><span className="text-muted-foreground">Make:</span> {result.make}</div>
              <div><span className="text-muted-foreground">Model:</span> {result.model}</div>
              {result.trim && <div><span className="text-muted-foreground">Trim:</span> {result.trim}</div>}
              {result.engine && <div><span className="text-muted-foreground">Engine:</span> {result.engine}</div>}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Powered by CARFAX QuickVIN Plus. Requires CARFAX API credentials.
        </p>
      </CardContent>
    </Card>
  );
}
