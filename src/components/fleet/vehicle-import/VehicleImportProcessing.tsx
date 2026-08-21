import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ImportProcessingProgress } from "@/features/vehicle-import/types";

interface VehicleImportProcessingProps {
  progress: ImportProcessingProgress;
}

export function VehicleImportProcessing({ progress }: VehicleImportProcessingProps) {
  const total = Math.max(progress.totalRows, 1);
  const percent = Math.round((progress.validatedRows / total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decode + Validation Processing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={percent} />
        <div className="grid gap-3 md:grid-cols-4 text-sm">
          <div className="rounded border p-3"><p className="text-muted-foreground text-xs">Parsed</p><p className="font-semibold">{progress.parsedRows}/{progress.totalRows}</p></div>
          <div className="rounded border p-3"><p className="text-muted-foreground text-xs">VIN Decoded</p><p className="font-semibold">{progress.decodedRows}/{progress.totalRows}</p></div>
          <div className="rounded border p-3"><p className="text-muted-foreground text-xs">Validated</p><p className="font-semibold">{progress.validatedRows}/{progress.totalRows}</p></div>
          <div className="rounded border p-3"><p className="text-muted-foreground text-xs">Duplicate Checked</p><p className="font-semibold">{progress.duplicateCheckedRows}/{progress.totalRows}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}
