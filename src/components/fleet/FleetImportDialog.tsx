/**
 * FleetImportDialog — Drag-drop CSV/Excel import for fleet clients & vehicles
 * 
 * Supports: .csv, .xlsx, .xls
 * Features: file parsing, preview table, validation errors, batch insert
 */

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface FleetImportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  templateColumns: string[];
  templateFileName: string;
  onValidate: (rows: Record<string, string>[]) => {
    valid: any[];
    errors: Array<{ row: number; message: string }>;
  };
  onImport: (validRows: any[]) => Promise<{ inserted: number; errors: string[] }>;
  onComplete: () => void;
}

type ImportStep = "upload" | "preview" | "importing" | "done";

export const FleetImportDialog = ({
  open,
  onClose,
  title,
  description,
  templateColumns,
  templateFileName,
  onValidate,
  onImport,
  onComplete,
}: FleetImportDialogProps) => {
  const [step, setStep] = useState<ImportStep>("upload");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [validRows, setValidRows] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [importResult, setImportResult] = useState<{ inserted: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setDragging(false);
    setFileName("");
    setRawRows([]);
    setHeaders([]);
    setValidRows([]);
    setValidationErrors([]);
    setImportResult(null);
    setImporting(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  /** Parse CSV or Excel file into row objects */
  const parseFile = useCallback(
    async (file: File) => {
      setFileName(file.name);

      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
          raw: false,
        });

        if (json.length === 0) {
          toast.error("File is empty or has no data rows");
          return;
        }

        const fileHeaders = Object.keys(json[0]);
        setHeaders(fileHeaders);
        setRawRows(json);

        // Run validation
        const result = onValidate(json);
        setValidRows(result.valid);
        setValidationErrors(result.errors);
        setStep("preview");
      } catch {
        toast.error("Failed to parse file. Make sure it's a valid CSV or Excel file.");
      }
    },
    [onValidate]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setStep("importing");

    try {
      const result = await onImport(validRows);
      setImportResult(result);
      setStep("done");

      if (result.inserted > 0) {
        toast.success(`Imported ${result.inserted} record${result.inserted !== 1 ? "s" : ""}`);
        onComplete();
      }
    } catch {
      toast.error("Import failed");
      setStep("preview");
    } finally {
      setImporting(false);
    }
  };

  /** Download a CSV template with the expected columns */
  const downloadTemplate = () => {
    const csvContent = templateColumns.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="font-medium text-foreground">
                Drop your file here, or click to browse
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                CSV, XLSX, or XLS • Max 5,000 rows
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
                className="gap-1"
              >
                <Download className="h-4 w-4" />
                Download Template
              </Button>
              <p className="text-xs text-muted-foreground">
                Column headers are matched automatically
              </p>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <div className="space-y-4 flex-1 min-h-0">
            {/* Stats bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                {fileName}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                {rawRows.length} row{rawRows.length !== 1 ? "s" : ""} found
              </Badge>
              {validRows.length > 0 && (
                <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  {validRows.length} valid
                </Badge>
              )}
              {validationErrors.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {validationErrors.length} error{validationErrors.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3 max-h-28 overflow-y-auto">
                <p className="text-xs font-medium text-destructive mb-1.5">Validation Errors</p>
                {validationErrors.slice(0, 20).map((err, i) => (
                  <p key={i} className="text-xs text-destructive/80">
                    Row {err.row}: {err.message}
                  </p>
                ))}
                {validationErrors.length > 20 && (
                  <p className="text-xs text-destructive/60 mt-1">
                    ...and {validationErrors.length - 20} more
                  </p>
                )}
              </div>
            )}

            {/* Preview table */}
            <ScrollArea className="h-[240px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-xs">#</TableHead>
                    {headers.slice(0, 6).map((h) => (
                      <TableHead key={h} className="text-xs whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                    {headers.length > 6 && (
                      <TableHead className="text-xs">+{headers.length - 6} more</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      {headers.slice(0, 6).map((h) => (
                        <TableCell key={h} className="text-xs max-w-[140px] truncate">
                          {row[h] || "—"}
                        </TableCell>
                      ))}
                      {headers.length > 6 && <TableCell className="text-xs text-muted-foreground">…</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            {rawRows.length > 50 && (
              <p className="text-xs text-muted-foreground text-center">
                Showing first 50 of {rawRows.length} rows
              </p>
            )}
          </div>
        )}

        {/* Step: Importing */}
        {step === "importing" && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin mb-3" />
            <p className="font-medium text-foreground">Importing {validRows.length} records...</p>
            <p className="text-sm text-muted-foreground mt-1">This may take a moment</p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && importResult && (
          <div className="py-10 text-center space-y-3">
            {importResult.inserted > 0 ? (
              <>
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
                <p className="text-lg font-semibold text-foreground">
                  {importResult.inserted} record{importResult.inserted !== 1 ? "s" : ""} imported
                </p>
              </>
            ) : (
              <>
                <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
                <p className="text-lg font-semibold text-foreground">Import failed</p>
              </>
            )}
            {importResult.errors.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3 text-left max-h-24 overflow-y-auto">
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset} className="gap-1">
                <X className="h-4 w-4" /> Start Over
              </Button>
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="gap-1"
              >
                <Upload className="h-4 w-4" />
                Import {validRows.length} Record{validRows.length !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
