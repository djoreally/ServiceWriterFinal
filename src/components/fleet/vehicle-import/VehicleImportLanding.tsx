import { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, ClipboardPaste, FileSpreadsheet, DatabaseZap } from "lucide-react";
import { IMPORT_TEMPLATE_HEADERS, VEHICLE_IMPORT_SAMPLE_TSV } from "@/features/vehicle-import/mockData";

interface VehicleImportLandingProps {
  onFileSelected: (file: File) => void;
  onPasteImported: (tabularInput: string) => void;
}

export function VehicleImportLanding({ onFileSelected, onPasteImported }: VehicleImportLandingProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteInput, setPasteInput] = useState(VEHICLE_IMPORT_SAMPLE_TSV);
  const downloadTemplate = () => {
    const headerRow = IMPORT_TEMPLATE_HEADERS.join(",");
    const sampleRows = VEHICLE_IMPORT_SAMPLE_TSV
      .split("\n")
      .slice(1)
      .map((line) => line.split("\t").join(","));
    const csv = [headerRow, ...sampleRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fleet-vehicle-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-slate-800 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Import Vehicles</CardTitle>
            <CardDescription className="text-slate-300">
              Upload CSV/XLSX or paste tabular vehicle data. This pipeline validates, decodes VINs through NHTSA,
              detects duplicates, and stages clean records for controlled commit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-lg border border-dashed border-slate-700 bg-slate-900/70 p-8 text-center cursor-pointer hover:border-emerald-500/60"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) onFileSelected(dropped);
              }}
            >
              <FileSpreadsheet className="mx-auto mb-3 h-8 w-8 text-emerald-400" />
              <p className="font-medium">Drag and drop CSV/XLSX, or click to browse</p>
              <p className="mt-1 text-xs text-slate-400">Engineered for 10-5,000 rows with progressive processing</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) onFileSelected(selected);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">CSV</Badge>
              <Badge variant="secondary">XLSX</Badge>
              <Badge variant="secondary">Manual paste</Badge>
              <Badge variant="outline" className="border-emerald-700/70 text-emerald-400">Future API adapters ready</Badge>
              <Button size="sm" variant="outline" onClick={downloadTemplate}>Download template CSV</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Field Coverage</CardTitle>
            <CardDescription>Supported mappings (auto-detected with confidence scoring)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground max-h-72 overflow-auto">
            {IMPORT_TEMPLATE_HEADERS.map((header) => (
              <div key={header} className="rounded border p-2">{header}</div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardPaste className="h-4 w-4" /> Paste Grid Data</CardTitle>
          <CardDescription>Paste exported rows from external systems, then run the same mapping/decode pipeline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={pasteInput}
            onChange={(event) => setPasteInput(event.target.value)}
            className="font-mono h-52"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><DatabaseZap className="h-3 w-3" /> Raw payload is preserved for auditability.</p>
            <Button onClick={() => onPasteImported(pasteInput)}>Import pasted rows</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
