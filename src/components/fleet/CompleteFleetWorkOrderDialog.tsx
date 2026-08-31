import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { completeFleetWorkOrderWithDetails } from "@/application/commands";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CompleteFleetWorkOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string | null;
  workOrderLabel?: string | null;
  defaultMileage?: number | null;
  onCompleted?: () => void | Promise<void>;
}

export function CompleteFleetWorkOrderDialog({
  open,
  onOpenChange,
  workOrderId,
  workOrderLabel,
  defaultMileage,
  onCompleted,
}: CompleteFleetWorkOrderDialogProps) {
  const [mileage, setMileage] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => setMileage(defaultMileage && defaultMileage > 0 ? String(defaultMileage) : ""));
    void Promise.resolve().then(() => setNotes(""));
  }, [defaultMileage, open, workOrderId]);

  const complete = async () => {
    const mileageAtService = Number(mileage);
    if (!workOrderId || !Number.isFinite(mileageAtService) || mileageAtService <= 0) {
      toast.error("Enter a valid mileage at service");
      return;
    }
    setSubmitting(true);
    try {
      await completeFleetWorkOrderWithDetails({
        workOrderId,
        mileageAtService,
        technicianNotes: notes.trim() || null,
      });
      toast.success(`${workOrderLabel || "Work order"} completed`);
      onOpenChange(false);
      await onCompleted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to complete work order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {workOrderLabel || "work order"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="fleet-completion-mileage">Mileage at service</Label>
            <Input id="fleet-completion-mileage" type="number" min="1" step="1" inputMode="numeric" value={mileage} onChange={(event) => setMileage(event.target.value)} autoFocus />
            <p className="text-xs text-muted-foreground">Required to update the vehicle's maintenance history.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fleet-completion-notes">Completion notes</Label>
            <Textarea id="fleet-completion-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Service performed, findings, or recommendations" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={complete} disabled={submitting || !mileage.trim()}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {submitting ? "Completing…" : "Complete work order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
