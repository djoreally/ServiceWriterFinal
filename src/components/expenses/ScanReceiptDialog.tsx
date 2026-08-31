import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Camera, Upload, Sparkles, Loader2, CheckCircle2, AlertTriangle, ZoomIn } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { scanReceipt, createExpense, uploadReceipt, type OcrResult } from "@/application/commands/expenses.command";
import { fetchExpenseCategories, ensureDefaultCategoriesSeeded, resolveExpenseSubmitterContext } from "@/application/queries/expenses.query";
import { useAuth } from "@packages/auth";
import { AppointmentPicker } from "@/components/expenses/AppointmentPicker";
import { cn } from "@/lib/utils";
import type { ReceiptUploadStatus } from "@/components/expenses/ReceiptUploadField";

interface ScanReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId?: string | null;
  defaultBillable?: boolean;
  onSaved?: () => void;
}

type Step = "capture" | "review" | "saving";

interface Category { id: string; name: string }
interface LineItem { description: string; quantity: number; unit_price: number; line_total: number }

async function compressImage(file: File, maxBytes = 2 * 1024 * 1024): Promise<{ blob: Blob; base64: string; mimeType: string }> {
  // Skip compression for small files
  if (file.size <= maxBytes && file.type === "image/jpeg") {
    const base64 = await blobToBase64(file);
    return { blob: file, base64, mimeType: file.type };
  }
  const img = await loadImage(file);
  const maxDim = 2000;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let q = 0.85;
  let blob = await canvasToBlob(canvas, q);
  while (blob.size > maxBytes && q > 0.4) {
    q -= 0.1;
    blob = await canvasToBlob(canvas, q);
  }
  const base64 = await blobToBase64(blob);
  return { blob, base64, mimeType: "image/jpeg" };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", q));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      res(result.split(",")[1] ?? result);
    };
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export function ScanReceiptDialog({ open, onOpenChange, appointmentId, defaultBillable, onSaved }: ScanReceiptDialogProps) {
  const { session } = useAuth();
  const [step, setStep] = useState<Step>("capture");
  const [categories, setCategories] = useState<Category[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
  const [scanning, setScanning] = useState(false);
  const [ocr, setOcr] = useState<OcrResult | null>(null);

  // Editable fields
  const [vendorName, setVendorName] = useState("");
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [subtotal, setSubtotal] = useState<number>(0);
  const [taxAmount, setTaxAmount] = useState<number>(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("card");
  const [last4, setLast4] = useState<string>("");
  const [refNumber, setRefNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [isBillable, setIsBillable] = useState<boolean>(!!defaultBillable);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(appointmentId ?? null);
  const [uploadStatus, setUploadStatus] = useState<ReceiptUploadStatus>("idle");
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => setLinkedAppointmentId(appointmentId ?? null));
    const user = session?.user;
    if (!user) return;
    (async () => {
      try { await ensureDefaultCategoriesSeeded(user.id); } catch (e) { console.warn(e); }
      const { data } = await fetchExpenseCategories(user.id);
      setCategories(data ?? []);
    })();
  }, [open, appointmentId, session?.user]);

  const reset = () => {
    setStep("capture");
    setImagePreview(null);
    setImageBlob(null);
    setOcr(null);
    setVendorName("");
    setTxDate(new Date().toISOString().slice(0, 10));
    setSubtotal(0); setTaxAmount(0); setTotalAmount(0);
    setPaymentMethod("card"); setLast4(""); setRefNumber(""); setNotes("");
    setCategoryId(""); setIsBillable(!!defaultBillable); setLineItems([]);
    setUploadStatus("idle");
    setZoomOpen(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setScanning(true);
      const { blob, base64, mimeType } = await compressImage(file);
      setImageBlob(blob);
      setImageMime(mimeType);
      setImagePreview(URL.createObjectURL(blob));

      const result = await scanReceipt(base64, mimeType);
      setOcr(result);
      const e = result.extracted;
      setVendorName(e.vendor_name ?? "");
      if (e.transaction_date) setTxDate(e.transaction_date);
      setSubtotal(Number(e.subtotal ?? 0));
      setTaxAmount(Number(e.tax_amount ?? 0));
      setTotalAmount(Number(e.total_amount ?? 0));
      setPaymentMethod(e.payment_method ?? "card");
      setLast4(e.last4 ?? "");
      setRefNumber(e.reference_number ?? "");
      setLineItems(e.line_items ?? []);
      if (result.category.id) setCategoryId(result.category.id);
      setStep("review");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to scan receipt";
      toast({ title: "Scan failed", description: msg, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    if (!imageBlob) return;
    try {
      setStep("saving");
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const ext = imageMime === "image/png" ? "png" : "jpg";
      setUploadStatus("uploading");
      let path: string;
      try {
        path = await uploadReceipt(user.id, imageBlob, `receipt.${ext}`);
        setUploadStatus("uploaded");
      } catch (uploadErr) {
        setUploadStatus("failed");
        throw uploadErr;
      }

      // Resolve owner tenant + technician submitter context.
      const submitter = await resolveExpenseSubmitterContext(user.id);
      const isTech = submitter.technicianId !== null;

      await createExpense({
        user_id: submitter.ownerUserId,
        submitted_by_user_id: submitter.submittedByUserId,
        submitted_by: submitter.technicianId,
        vendor_name_raw: vendorName.trim() || "Unknown",
        category_id: categoryId || null,
        transaction_date: txDate,
        subtotal, tax_amount: taxAmount, total_amount: totalAmount,
        payment_method: paymentMethod || null,
        last4: last4 || null,
        reference_number: refNumber || null,
        notes: notes || null,
        receipt_url: path,
        is_billable: isBillable,
        // Always persist the link so the picker remembers across billable toggles.
        appointment_id: linkedAppointmentId,
        ocr_confidence: ocr?.extracted.confidence ?? null,
        ocr_raw_json: ocr?.extracted ?? null,
        status: isTech ? "pending" : "approved",
        line_items: lineItems,
      });

      toast({ title: "Expense saved", description: "Receipt uploaded and categorized." });
      onSaved?.();
      handleClose(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save expense";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
      setStep("review");
    }
  };

  const lowConfidence = (ocr?.extracted.confidence ?? 1) < 0.8;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Scan Receipt
          </DialogTitle>
        </DialogHeader>

        {step === "capture" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Snap a photo of the receipt. AI will extract vendor, date, amounts, and line items automatically.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-accent transition-colors">
                <Camera className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium">Take Photo</span>
                <span className="text-xs text-muted-foreground">Use camera</span>
                <input
                  type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-accent transition-colors">
                <Upload className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium">Upload File</span>
                <span className="text-xs text-muted-foreground">JPG / PNG / HEIC</span>
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
            </div>
            {scanning && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading receipt with AI…
                </div>
                <Progress value={66} className="h-1" />
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              {imagePreview && (
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  className="relative w-full group rounded-lg overflow-hidden border border-border bg-muted cursor-zoom-in"
                  aria-label="Open full receipt preview"
                >
                  <img
                    src={imagePreview}
                    alt="Receipt"
                    className="w-full max-h-[60vh] object-contain"
                  />
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 rounded-md bg-background/90 px-3 py-1 text-xs font-medium">
                      <ZoomIn className="h-3.5 w-3.5" /> Tap to zoom
                    </span>
                  </span>
                </button>
              )}
              <div className="flex items-center flex-wrap gap-2">
                {ocr?.category.source === "learned" && (
                  <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Vendor learned: {ocr.category.name}</Badge>
                )}
                {ocr?.category.source === "ai_suggested" && (
                  <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />AI suggested: {ocr.category.name}</Badge>
                )}
                {ocr && (
                  <Badge variant={lowConfidence ? "destructive" : "secondary"}>
                    Confidence: {Math.round((ocr.extracted.confidence ?? 0) * 100)}%
                  </Badge>
                )}
                {/* Upload status pill — same visual language as ReceiptUploadField */}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    uploadStatus === "uploading" && "bg-primary/10 text-primary border-primary/30",
                    uploadStatus === "uploaded" && "bg-success/10 text-success border-success/30",
                    uploadStatus === "failed" && "bg-destructive/10 text-destructive border-destructive/30",
                    uploadStatus === "idle" && "bg-muted text-muted-foreground border-border",
                  )}
                  aria-live="polite"
                >
                  {uploadStatus === "uploading" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {uploadStatus === "uploaded" && <CheckCircle2 className="h-3 w-3" />}
                  {uploadStatus === "failed" && <AlertTriangle className="h-3 w-3" />}
                  {uploadStatus === "idle" && "Ready to upload"}
                  {uploadStatus === "uploading" && "Uploading…"}
                  {uploadStatus === "uploaded" && "Uploaded"}
                  {uploadStatus === "failed" && "Upload failed"}
                </span>
              </div>
              {lowConfidence && (
                <div className="flex gap-2 items-start text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/30">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Low OCR confidence — please verify all fields below before saving.</span>
                </div>
              )}
            </div>

            {/* Full-size zoom dialog */}
            <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
              <DialogContent className="max-w-4xl p-2 sm:p-4 bg-background">
                <DialogTitle className="sr-only">Receipt preview</DialogTitle>
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Receipt full preview"
                    className="w-full max-h-[85vh] object-contain rounded"
                  />
                )}
              </DialogContent>
            </Dialog>

            <div className="space-y-3">
              <div>
                <Label>Vendor</Label>
                <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Subtotal</Label>
                  <Input type="number" step="0.01" value={subtotal} onChange={(e) => setSubtotal(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Tax</Label>
                  <Input type="number" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Total</Label>
                  <Input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Payment</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="ach">ACH</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Last 4</Label>
                  <Input value={last4} maxLength={4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>
              <div>
                <Label>Reference #</Label>
                <Input value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2 rounded-md border border-border px-3 py-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} />
                  Re-bill to {appointmentId ? "this job" : "a job"} (billable)
                </label>
                {isBillable && (
                  <div className="space-y-1 pt-1 border-t border-border/60">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Linked appointment
                    </Label>
                    <AppointmentPicker
                      value={linkedAppointmentId}
                      onChange={(id) => setLinkedAppointmentId(id)}
                      disabled={!!appointmentId}
                      placeholder="Search and select an appointment…"
                    />
                  </div>
                )}
              </div>

              {lineItems.length > 0 && (
                <div className="space-y-1 border-t pt-2">
                  <Label className="text-xs uppercase tracking-wider">Line items</Label>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                    {lineItems.map((li, i) => (
                      <div key={i} className="grid grid-cols-12 gap-1 items-center">
                        <Input
                          className="col-span-6 h-8 text-xs"
                          value={li.description}
                          onChange={(e) => setLineItems(lineItems.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                        />
                        <Input
                          className="col-span-2 h-8 text-xs"
                          type="number" step="0.01"
                          value={li.quantity}
                          onChange={(e) => setLineItems(lineItems.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                        />
                        <Input
                          className="col-span-2 h-8 text-xs"
                          type="number" step="0.01"
                          value={li.unit_price}
                          onChange={(e) => setLineItems(lineItems.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))}
                        />
                        <Input
                          className="col-span-2 h-8 text-xs"
                          type="number" step="0.01"
                          value={li.line_total}
                          onChange={(e) => setLineItems(lineItems.map((x, j) => j === i ? { ...x, line_total: Number(e.target.value) } : x))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === "saving" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Saving expense…</p>
          </div>
        )}

        <DialogFooter>
          {step === "capture" && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("capture")}>Re-scan</Button>
              <Button onClick={handleSave} disabled={!vendorName || totalAmount <= 0}>Save Expense</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
