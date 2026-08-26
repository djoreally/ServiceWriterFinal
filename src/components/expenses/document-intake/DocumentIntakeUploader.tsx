import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileText, Image as ImageIcon, Fuel, Wrench, Receipt } from "lucide-react";
import {
  uploadIntakeDocument,
  triggerDocumentParse,
  type IntakeProfile,
} from "@/application/queries/document-intake.query";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@packages/auth";
import { cn } from "@/lib/utils";

interface Props {
  onUploaded: () => void;
}

const PROFILE_OPTIONS: Array<{ key: IntakeProfile; label: string; icon: typeof Fuel; desc: string }> = [
  { key: "service", label: "Service Invoice", icon: Wrench, desc: "Repair / maintenance with VIN, mileage, oil" },
  { key: "fuel", label: "Fuel Receipt", icon: Fuel, desc: "Gallons, price/gal, odometer, station" },
  { key: "general", label: "General Receipt", icon: Receipt, desc: "Standard expense receipt" },
];

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

export function DocumentIntakeUploader({ onUploaded }: Props) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<IntakeProfile>("service");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const user = session?.user;
    if (!user) {
      toast.error("Please sign in to upload documents.");
      return;
    }
    setBusy(true);
    let okCount = 0;
    for (const file of Array.from(files)) {
      try {
        const doc = await uploadIntakeDocument({ file, profile, userId: user.id });
        toast.message(`Uploaded ${file.name}`, { description: "Parsing in background…" });
        // Fire parse but don't block UI on it — UI will refresh
        triggerDocumentParse(doc.id)
          .then(() => onUploaded())
          .catch((e) => {
            console.error(e);
            toast.error(`Parse failed: ${file.name}`);
            onUploaded();
          });
        okCount++;
      } catch (e) {
        console.error(e);
        toast.error(`Upload failed: ${file.name}`);
      }
    }
    setBusy(false);
    if (okCount > 0) onUploaded();
  };

  return (
    <Card className="border-border/60">
      <CardContent className="p-5 space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Document Intake
          </p>
          <h3 className="text-base font-semibold tracking-tight mt-0.5">
            Drop PDFs and receipts → parsed into structured data
          </h3>
        </div>

        {/* Profile picker */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PROFILE_OPTIONS.map(({ key, label, icon: Icon, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => setProfile(key)}
              className={cn(
                "text-left rounded-lg border p-3 transition-colors",
                profile === key
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-border bg-card",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", profile === key ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{desc}</p>
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            "rounded-lg border border-dashed p-8 text-center cursor-pointer transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-border bg-muted/20",
            busy && "opacity-60 pointer-events-none",
          )}
        >
          <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium mt-3">
            {busy ? "Uploading…" : "Drop PDFs / images here, or click to browse"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            PDF, PNG, JPG, WEBP — up to 15MB each • multiple files supported
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" /> PDF</Badge>
            <Badge variant="outline" className="gap-1"><ImageIcon className="h-3 w-3" /> Image</Badge>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            Choose files
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
