import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ImportSummary, VehicleImportBatch, VehicleImportRow } from "@/features/vehicle-import/types";

interface VehicleImportResultsProps {
  batch: VehicleImportBatch;
  rows: VehicleImportRow[];
  summary: ImportSummary;
  onStartOver: () => void;
  onCreateWorkOrders?: () => void;
}

export function VehicleImportResults({ batch, rows, summary, onStartOver, onCreateWorkOrders }: VehicleImportResultsProps) {
  const exportErrorsCsv = () => {
    const errorRows = rows.filter((row) => row.validationStatus === "blocked" || row.validationStatus === "failed" || row.commitStatus === "failed");
    const headers = ["row", "status", "duplicate_status", "messages"];
    const csv = [
      headers.join(","),
      ...errorRows.map((row) => [row.rowIndex, row.validationStatus, row.duplicateStatus, row.validationMessages.map((m) => m.message).join(" | ")].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vehicle-import-errors-${batch.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Results</CardTitle>
        <CardDescription>Batch {batch.id} completed. Full row-level outcomes retained for audit and support debugging.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Metric title="Imported" value={summary.importedSuccessfully} />
          <Metric title="Skipped" value={summary.skipped} />
          <Metric title="Duplicates" value={summary.duplicatesFound} />
          <Metric title="Validation failed" value={summary.failedValidation} />
          <Metric title="Warnings accepted" value={summary.warningsAccepted} />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={exportErrorsCsv}>Download error CSV</Button>
          <Button variant="outline" onClick={onStartOver}>Start new import batch</Button>
          {onCreateWorkOrders && <Button onClick={onCreateWorkOrders}>Create work orders</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
