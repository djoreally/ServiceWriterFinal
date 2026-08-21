import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VehicleImportBatch, VehicleImportRow, VehicleImportRowStatus } from "@/features/vehicle-import/types";

const STATUS_OPTIONS: VehicleImportRowStatus[] = ["pending", "valid", "needs_review", "blocked", "imported", "failed"];

interface VehicleImportReviewProps {
  batch: VehicleImportBatch;
  rows: VehicleImportRow[];
  onRowSkip: (rowId: string, skip: boolean) => void;
  onRowOverride: (rowId: string, patch: Record<string, unknown>) => void;
  onBulkApproveReady: () => void;
  onRevalidate: () => void;
  onCommit: () => void;
  /** Manual per-row VIN decode (Review + Resolve). */
  onRowDecode?: (rowId: string, vinOverride?: string) => void | Promise<void>;
  decodingRowIds?: string[];
}

function statusVariant(status: VehicleImportRowStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "blocked" || status === "failed") return "destructive";
  if (status === "valid" || status === "imported") return "default";
  if (status === "needs_review" || status === "pending") return "secondary";
  return "outline";
}

const GRID = "grid min-w-[1280px] grid-cols-[70px_120px_230px_90px_150px_170px_130px_120px_150px_70px] gap-2";

export function VehicleImportReview({ batch, rows, onRowSkip, onRowOverride, onBulkApproveReady, onRevalidate, onCommit, onRowDecode, decodingRowIds = [] }: VehicleImportReviewProps) {

  const [statusFilter, setStatusFilter] = useState<VehicleImportRowStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.validationStatus !== statusFilter) return false;
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return [
        row.mappedPayload.vin,
        row.mappedPayload.unitNumber,
        row.mappedPayload.plate,
        row.mappedPayload.make,
        row.mappedPayload.model,
      ]
        .filter(Boolean)
        .some((candidate) => candidate!.toLowerCase().includes(query));
    });
  }, [rows, search, statusFilter]);
  const blockingRows = rows.filter((row) => row.commitStatus !== "skipped" && (row.validationStatus === "blocked" || row.validationStatus === "pending" || row.validationStatus === "failed"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review + Resolve</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Input placeholder="Search VIN / unit / plate / make / model" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as VehicleImportRowStatus | "all")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all statuses</SelectItem>
                {STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onRevalidate}>Re-run validation + duplicate checks</Button>
            <Button variant="outline" onClick={onBulkApproveReady}>Bulk approve valid/reviewed</Button>
            <Button onClick={onCommit} disabled={blockingRows.length > 0}>Commit import</Button>
          </div>
        </div>
        {blockingRows.length > 0 && (
          <p className="text-sm text-destructive">
            Commit blocked: {blockingRows.length} row(s) still pending/blocked/failed.
          </p>
        )}

        <ScrollArea className="h-[520px] border rounded-lg">
          <div className={`${GRID} p-2 text-xs font-semibold text-muted-foreground border-b sticky top-0 bg-background z-10`}>
                <div>Row</div><div>Status</div><div>VIN</div><div>Year</div><div>Make</div><div>Model</div><div>Unit</div><div>Duplicate</div><div>Decode</div><div>Issues</div>
          </div>
          {filtered.map((row) => {
            const merged = { ...row.mappedPayload, ...row.decodedPayload, ...row.resolutionPayload };
            const decoding = decodingRowIds.includes(row.id);
            return (
              <div key={row.id} className="border-b">
                <div className={`${GRID} p-2 text-sm items-center`}>
                  <button className="text-left text-muted-foreground" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>#{row.rowIndex}</button>
                  <Badge variant={statusVariant(row.validationStatus)}>{row.validationStatus}</Badge>
                  <Input
                    key={`${row.id}-vin-${merged.vin}`}
                    defaultValue={merged.vin || ""}
                    placeholder="17-digit VIN"
                    className="font-mono text-xs uppercase"
                    onBlur={(e) => {
                      const vin = e.target.value.trim().toUpperCase();
                      if (vin !== (merged.vin || "")) {
                        onRowOverride(row.id, { vin: vin || undefined });
                        if (vin.length >= 17 && onRowDecode) void onRowDecode(row.id, vin);
                      }
                    }}
                  />
                  <Input 
                    key={`${row.id}-year-${merged.year}`}
                    defaultValue={String(merged.year || "")} 
                    onBlur={(e) => onRowOverride(row.id, { year: Number.parseInt(e.target.value, 10) || undefined })} 
                  />
                  <Input 
                    key={`${row.id}-make-${merged.make}`}
                    defaultValue={merged.make || ""} 
                    onBlur={(e) => onRowOverride(row.id, { make: e.target.value || undefined })} 
                  />
                  <Input 
                    key={`${row.id}-model-${merged.model}`}
                    defaultValue={merged.model || ""} 
                    onBlur={(e) => onRowOverride(row.id, { model: e.target.value || undefined })} 
                  />
                  <Input 
                    key={`${row.id}-unit-${merged.unitNumber}`}
                    defaultValue={merged.unitNumber || ""} 
                    onBlur={(e) => onRowOverride(row.id, { unitNumber: e.target.value || undefined })} 
                  />
                  <span className="text-xs">{row.duplicateStatus}</span>
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-xs">{decoding ? "decoding…" : row.decodeStatus}</span>
                    {onRowDecode && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        disabled={decoding}
                        onClick={() => void onRowDecode(row.id)}
                      >
                        {decoding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Decode VIN"}
                      </Button>
                    )}
                  </div>
                  <span>{row.validationMessages.length}</span>
                </div>

                {expanded === row.id && <ExpandedRow row={row} onRowSkip={onRowSkip} onRowOverride={onRowOverride} />}
              </div>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ExpandedRow({
  row,
  onRowSkip,
  onRowOverride,
}: {
  row: VehicleImportRow;
  onRowSkip: (rowId: string, skip: boolean) => void;
  onRowOverride: (rowId: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="grid gap-4 p-3 bg-muted/20 md:grid-cols-3 text-xs">
      <div>
        <p className="font-semibold mb-1">Validation messages</p>
        <ul className="space-y-1">
          {row.validationMessages.map((message, index) => (
            <li key={`${message.code}-${index}`} className="text-muted-foreground">[{message.severity}] {message.message}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-semibold mb-1">Raw vs normalized</p>
        <pre className="rounded border p-2 overflow-auto max-h-40">{JSON.stringify({ raw: row.rawPayload, normalized: row.normalizedPayload }, null, 2)}</pre>
      </div>
      <div>
        <p className="font-semibold mb-1">Decoded profile snapshot</p>
        <pre className="rounded border p-2 overflow-auto max-h-40">{JSON.stringify(row.decodedPayload || {}, null, 2)}</pre>
        <div className="space-y-2 mt-3">
          <p className="font-semibold">Required assignments</p>
          <Input defaultValue={String(row.resolutionPayload?.customerId || row.mappedPayload.customerId || "")} onBlur={(e) => onRowOverride(row.id, { customerId: e.target.value || undefined })} placeholder="Fleet/client name or ID" />
          <Input defaultValue={String(row.resolutionPayload?.locationId || row.mappedPayload.locationId || "")} onBlur={(e) => onRowOverride(row.id, { locationId: e.target.value || undefined })} placeholder="Location name or ID" />
          <Input defaultValue={String(row.resolutionPayload?.contractId || row.mappedPayload.contractId || "")} onBlur={(e) => onRowOverride(row.id, { contractId: e.target.value || undefined })} placeholder="Contract name or ID" />
          <Input defaultValue={String(row.resolutionPayload?.serviceProfile || row.mappedPayload.serviceProfile || "")} onBlur={(e) => onRowOverride(row.id, { serviceProfile: e.target.value || undefined })} placeholder="Service profile or rule ID" />
        </div>
        <p className="font-semibold mt-3 mb-1">Assignment snapshot</p>
        <pre className="rounded border p-2 overflow-auto max-h-40">{JSON.stringify({
          fleet: row.resolutionPayload?.customerId || row.mappedPayload.customerId || null,
          location: row.resolutionPayload?.locationId || row.mappedPayload.locationId || null,
          contract: row.resolutionPayload?.contractId || row.mappedPayload.contractId || null,
          serviceProfile: row.resolutionPayload?.serviceProfile || row.mappedPayload.serviceProfile || null,
        }, null, 2)}</pre>
        <div className="mt-2">
          <Button variant={row.commitStatus === "skipped" ? "secondary" : "outline"} onClick={() => onRowSkip(row.id, row.commitStatus !== "skipped")}>
            {row.commitStatus === "skipped" ? "Unskip row" : "Skip row"}
          </Button>
        </div>
      </div>
    </div>
  );
}
