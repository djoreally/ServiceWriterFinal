import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";
import {
  Upload,
  X,
  ImageIcon,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ExternalLink,
} from "lucide-react";

export type ReceiptUploadStatus = "idle" | "uploading" | "uploaded" | "failed";

interface ReceiptUploadFieldProps {
  /** Currently selected file (uncontrolled UI is allowed but value drives display) */
  file: File | null;
  /** Called when user picks a file or clears it (null = clear) */
  onFileChange: (file: File | null) => void;
  /** Live status of the upload pipeline (driven by parent's save flow) */
  status?: ReceiptUploadStatus;
  /** Optional error string shown when status === "failed" */
  errorMessage?: string | null;
  /** Field label, defaults to "Receipt" */
  label?: string;
  /** Optional helper copy under the label */
  helperText?: string;
  /** Show "(optional)" suffix on the label */
  optional?: boolean;
  /** Hide the label row entirely (useful inside scan flow) */
  hideLabel?: boolean;
  /** Customize the empty-state CTA text */
  ctaText?: string;
  /** Disable interaction (e.g., during save) */
  disabled?: boolean;
  /** Accept attribute for the file input */
  accept?: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  ReceiptUploadStatus,
  { label: string; tone: "muted" | "info" | "success" | "danger"; icon: React.ReactNode }
> = {
  idle: { label: "Ready to upload", tone: "muted", icon: <ImageIcon className="h-3 w-3" /> },
  uploading: {
    label: "Uploading…",
    tone: "info",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  uploaded: {
    label: "Uploaded",
    tone: "success",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Upload failed",
    tone: "danger",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

const TONE_CLASSES: Record<"muted" | "info" | "success" | "danger", string> = {
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-primary/10 text-primary border-primary/30",
  success: "bg-success/10 text-success border-success/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
};

export function ReceiptUploadField({
  file,
  onFileChange,
  status = "idle",
  errorMessage,
  label = "Receipt",
  helperText,
  optional,
  hideLabel,
  ctaText = "Upload receipt photo or PDF",
  disabled,
  accept = "image/*,application/pdf",
  className,
}: ReceiptUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

  // Manage object URL lifecycle for the selected file
  useEffect(() => {
    if (!file) {
      void Promise.resolve().then(() => setPreviewUrl(null));
      return;
    }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      void Promise.resolve().then(() => setPreviewUrl(url));
      return () => URL.revokeObjectURL(url);
    }
    void Promise.resolve().then(() => setPreviewUrl(null));
  }, [file]);

  const isPdf = file?.type === "application/pdf";
  const statusConf = STATUS_CONFIG[status];

  const openFullPreview = () => {
    if (!file) return;
    if (previewUrl) {
      setZoomOpen(true);
      return;
    }
    if (isPdf) {
      // Open PDF in a new tab via blob URL
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      // Revoke shortly after to give the tab time to load
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center justify-between">
          <Label>
            {label}
            {optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
          </Label>
          {file && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                TONE_CLASSES[statusConf.tone],
              )}
              aria-live="polite"
            >
              {statusConf.icon}
              {statusConf.label}
            </span>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled || status === "uploading"}
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      {!file ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="w-full justify-start gap-2 font-normal h-11"
        >
          <Upload className="h-4 w-4" />
          {ctaText}
        </Button>
      ) : (
        <div
          className={cn(
            "flex items-center gap-3 rounded-md border p-2 transition-colors",
            status === "failed" ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
          )}
        >
          {/* Thumbnail — tap to zoom */}
          <button
            type="button"
            onClick={openFullPreview}
            disabled={!previewUrl && !isPdf}
            className={cn(
              "relative h-14 w-14 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center group",
              (previewUrl || isPdf) && "cursor-zoom-in hover:ring-2 hover:ring-primary/50 transition",
            )}
            aria-label="Open full receipt preview"
          >
            {previewUrl ? (
              <>
                <ProgressiveImage src={previewUrl} alt="Receipt preview" className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </>
            ) : isPdf ? (
              <FileText className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-sm truncate font-medium">{file.name}</p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{(file.size / 1024).toFixed(1)} KB</span>
              {(previewUrl || isPdf) && (
                <button
                  type="button"
                  onClick={openFullPreview}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  {isPdf ? "Open PDF" : "View full"}
                </button>
              )}
            </div>
            {status === "failed" && errorMessage && (
              <p className="text-[11px] text-destructive mt-0.5 truncate">{errorMessage}</p>
            )}
          </div>

          {/* Inline status pill (shown when label is hidden, e.g. compact contexts) */}
          {hideLabel && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                TONE_CLASSES[statusConf.tone],
              )}
              aria-live="polite"
            >
              {statusConf.icon}
              {statusConf.label}
            </span>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={status === "uploading"}
            onClick={() => onFileChange(null)}
            aria-label="Remove receipt"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {helperText && !file && (
        <p className="text-[11px] text-muted-foreground">{helperText}</p>
      )}

      {/* Full-size zoom preview (images only) */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-4xl p-2 sm:p-4 bg-background">
          <DialogTitle className="sr-only">Receipt preview</DialogTitle>
          {previewUrl && (
            <ProgressiveImage
              src={previewUrl}
              alt="Receipt full preview"
              className="w-full max-h-[85vh] object-contain rounded"
              placeholderClassName="w-full h-[70vh] rounded"
            />
          )}
          {file && (
            <div className="flex items-center justify-between pt-2 px-1 text-xs text-muted-foreground">
              <span className="truncate">{file.name}</span>
              <span>{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
