import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { parseImportFile, ParsedData, ParsedRow, autoMapHeaders } from "@/lib/importParser";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export interface FieldMapping {
  field: string;
  label: string;
  required?: boolean;
}

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fieldMappings: Record<string, string[]>;
  fields: FieldMapping[];
  onImport: (rows: ParsedRow[], mapping: Record<string, string>) => Promise<{ success: number; failed: number; errors: string[] }>;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

export function ImportDialog({
  open,
  onOpenChange,
  title,
  description,
  fieldMappings,
  fields,
  onImport,
}: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const resetState = useCallback(() => {
    setStep('upload');
    setParsedData(null);
    setMapping({});
    setImportProgress(0);
    setImportResult(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
  }, [resetState, onOpenChange]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    
    const extension = file.name.split('.').pop()?.toLowerCase();
    const isValidType = validTypes.includes(file.type) || ['csv', 'xls', 'xlsx'].includes(extension || '');

    if (!isValidType) {
      toast.error('Please select a CSV or Excel file');
      return;
    }

    try {
      const data = await parseImportFile(file);
      
      if (data.rows.length === 0) {
        toast.error('The file appears to be empty');
        return;
      }

      setParsedData(data);
      
      // Auto-map headers
      const autoMapping = autoMapHeaders(data.headers, fieldMappings);
      setMapping(autoMapping);
      
      setStep('mapping');
      toast.success(`Found ${data.rows.length} rows to import`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to parse file');
    }
  }, [fieldMappings]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleMappingChange = useCallback((field: string, header: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: header === '__none__' ? '' : header,
    }));
  }, []);

  const canProceedToPreview = useCallback(() => {
    const requiredFields = fields.filter(f => f.required).map(f => f.field);
    return requiredFields.every(field => mapping[field]);
  }, [fields, mapping]);

  const handleStartImport = useCallback(async () => {
    if (!parsedData) return;

    setStep('importing');
    setImportProgress(0);

    try {
      const result = await onImport(parsedData.rows, mapping);
      setImportResult(result);
      setStep('complete');
      
      if (result.success > 0) {
        toast.success(`Successfully imported ${result.success} records`);
      }
      if (result.failed > 0) {
        toast.error(`Failed to import ${result.failed} records`);
      }
    } catch (error) {
      setImportResult({
        success: 0,
        failed: parsedData.rows.length,
        errors: [error instanceof Error ? error.message : 'Import failed'],
      });
      setStep('complete');
    }
  }, [parsedData, mapping, onImport]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" aria-describedby="import-dialog-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {title}
          </DialogTitle>
          <p id="import-dialog-description" className="text-sm text-muted-foreground">{description}</p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-border"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Drop your file here</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Supports CSV, XLS, and XLSX files
              </p>
              <Label htmlFor="file-upload" className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>Browse Files</span>
                </Button>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </Label>
            </div>
          )}

          {/* Step: Mapping */}
          {step === 'mapping' && parsedData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Map your file columns to the correct fields
                </p>
                <Badge variant="outline">
                  {parsedData.rows.length} rows
                </Badge>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg p-4">
                <div className="space-y-4">
                  {fields.map((field) => (
                    <div key={field.field} className="flex items-center gap-4">
                      <div className="w-1/3">
                        <Label className="flex items-center gap-1">
                          {field.label}
                          {field.required && <span className="text-destructive">*</span>}
                        </Label>
                      </div>
                      <div className="w-2/3">
                        <Select
                          value={mapping[field.field] || '__none__'}
                          onValueChange={(value) => handleMappingChange(field.field, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">-- Skip --</SelectItem>
                            {parsedData.headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  Back
                </Button>
                <Button 
                  onClick={() => setStep('preview')}
                  disabled={!canProceedToPreview()}
                >
                  Preview Data
                </Button>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && parsedData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Review the data before importing
                </p>
                <Badge variant="outline">
                  {parsedData.rows.length} rows to import
                </Badge>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {fields.filter(f => mapping[f.field]).map((field) => (
                        <TableHead key={field.field}>{field.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.rows.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        {fields.filter(f => mapping[f.field]).map((field) => (
                          <TableCell key={field.field} className="max-w-[200px] truncate">
                            {String(row[mapping[field.field]] ?? '—')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedData.rows.length > 10 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    ...and {parsedData.rows.length - 10} more rows
                  </div>
                )}
              </ScrollArea>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setStep('mapping')}>
                  Back
                </Button>
                <Button onClick={handleStartImport}>
                  Import {parsedData.rows.length} Records
                </Button>
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
              <h3 className="text-lg font-medium">Importing...</h3>
              <Progress value={importProgress} className="max-w-xs mx-auto" />
              <p className="text-sm text-muted-foreground">
                Please wait while we import your data
              </p>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && importResult && (
            <div className="py-8 space-y-6">
              <div className="text-center">
                {importResult.success > 0 ? (
                  <CheckCircle className="h-12 w-12 mx-auto text-gray-500 mb-4" />
                ) : (
                  <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
                )}
                <h3 className="text-lg font-medium mb-2">Import Complete</h3>
                <div className="flex gap-4 justify-center">
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {importResult.success} Imported
                  </Badge>
                  {importResult.failed > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <X className="h-3 w-3" />
                      {importResult.failed} Failed
                    </Badge>
                  )}
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <ScrollArea className="h-[150px] border rounded-lg p-4">
                  <div className="space-y-2">
                    {importResult.errors.slice(0, 20).map((error, index) => (
                      <p key={index} className="text-sm text-destructive">
                        {error}
                      </p>
                    ))}
                    {importResult.errors.length > 20 && (
                      <p className="text-sm text-muted-foreground">
                        ...and {importResult.errors.length - 20} more errors
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )}

              <div className="flex justify-center">
                <Button onClick={handleClose}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
