import { useState } from "react";
import { cancelAppointmentByToken } from "@/application/queries/customer-booking.query";
import { sendBookingLifecycleSms } from "@/application/commands/sms.command";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle } from "lucide-react";

interface Props {
  appointment: {
    id: string;
    title: string;
    management_token: string | null;
    service_catalog?: { name: string } | null;
  };
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CancelDialog({ appointment, open, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleCancel = async () => {
    if (!appointment.management_token) return;

    setSubmitting(true);

    const { data, error } = await cancelAppointmentByToken(
      appointment.management_token!,
      reason || undefined,
    );

    setSubmitting(false);

    if (error) {
      toast.error(error.message || "Failed to cancel appointment");
      return;
    }

    const result = data as Record<string, unknown> | null;
    if (result?.success === false) {
      toast.error(
        (result.message as string) ||
          (result.error as string) ||
          "Unable to cancel. The cancellation window may have passed."
      );
      return;
    }

    toast.success("Appointment cancelled successfully");
    // Signature should ideally be derived from management_token or provided by backend
    const sig = "";
    sendBookingLifecycleSms({ appointmentId: appointment.id, type: "cancellation", signature: sig || undefined })
      .catch((e) => console.warn("[cancel-sms] failed", e));
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Cancel Appointment
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel &ldquo;
            {appointment.service_catalog?.name || appointment.title}&rdquo;?
            This action may not be reversible.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <label className="text-sm font-medium mb-2 block">
            Reason (optional)
          </label>
          <Textarea
            placeholder="Let us know why you're cancelling..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Keep Appointment
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Yes, Cancel Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
