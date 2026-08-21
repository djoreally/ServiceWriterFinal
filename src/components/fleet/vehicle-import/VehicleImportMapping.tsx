import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FieldMapping, VehicleImportBatch, VehicleProfileInput } from "@/features/vehicle-import/types";

const TARGET_FIELDS: Array<keyof VehicleProfileInput | "ignore"> = [
  "vin", "unitNumber", "year", "make", "model", "trim", "plate", "odometer",
  "customerId", "clientId", "fleetId", "locationId", "notes", "status", "fuelTypePrimary", "engine", "ignore",
];

interface VehicleImportMappingProps {
  batch: VehicleImportBatch;
  onChange: (mapping: FieldMapping[]) => void;
  onContinue: () => void;
}

export function VehicleImportMapping({ batch, onChange, onContinue }: VehicleImportMappingProps) {
  const missingRequired = batch.mapping.filter((m) => m.required && m.targetField === "ignore");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Column Mapping</CardTitle>
        <CardDescription>
          Auto-mapped {batch.mapping.length} columns from <span className="font-medium">{batch.sourceFileName || "pasted data"}</span>.
          Review before decode/validation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {batch.mapping.map((mapping, index) => (
            <div key={mapping.sourceHeader} className="grid items-center gap-2 rounded-lg border p-3 md:grid-cols-[1fr_auto_1fr]">
              <div>
                <p className="text-sm font-medium">{mapping.sourceHeader}</p>
                <p className="text-xs text-muted-foreground">Source column</p>
              </div>
              <Badge variant={mapping.confidence >= 0.8 ? "default" : "secondary"}>confidence {Math.round(mapping.confidence * 100)}%</Badge>
              <Select
                value={mapping.targetField}
                onValueChange={(value) => {
                  const next = [...batch.mapping];
                  next[index] = { ...mapping, targetField: value as keyof VehicleProfileInput | "ignore" };
                  onChange(next);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target field" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_FIELDS.map((field) => (
                    <SelectItem key={field} value={field}>{field}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {missingRequired.length > 0 && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
            {missingRequired.length} required mapping{missingRequired.length !== 1 ? "s are" : " is"} unresolved.
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onContinue} disabled={missingRequired.length > 0}>Validate import + run VIN decode</Button>
        </div>
      </CardContent>
    </Card>
  );
}
