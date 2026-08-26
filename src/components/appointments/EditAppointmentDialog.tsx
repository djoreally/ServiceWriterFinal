import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { normalizePhoneToE164, formatPhoneInput } from "@/lib/phone";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Calendar } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { editAppointment } from "@/application/commands/edit-appointment.command";
import { Appointment } from "@/shared/types";
import { format, parseISO, parse } from "date-fns";
import { bankersRound } from "@/lib/financialMath";

interface EditAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  onSuccess: () => void;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending Approval" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: EditAppointmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    scheduled_date: "",
    scheduled_time: "",
    duration_minutes: 60,
    status: "confirmed",
    notes: "",
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    estimated_cost: 0,
    location_address: "",
  });

  useEffect(() => {
    if (appointment) {
      const apptAny = appointment as unknown as Record<string, unknown>;
      const customerAddress = (appointment.customer as { address?: string } | undefined)?.address;
      setFormData({
        title: appointment.title || "",
        scheduled_date: appointment.scheduled_date || "",
        scheduled_time: appointment.scheduled_time || "",
        duration_minutes: appointment.duration_minutes || 60,
        status: appointment.status || "confirmed",
        notes: appointment.notes || "",
        guest_name: appointment.guest_name || appointment.customer?.name || "",
        guest_email: appointment.guest_email || appointment.customer?.email || "",
        guest_phone: appointment.guest_phone || appointment.customer?.phone || "",
        estimated_cost: appointment.estimated_cost || 0,
        location_address:
          (apptAny.location_address as string | null | undefined) ||
          customerAddress ||
          "",
      });
    }
  }, [appointment, open]);

  const handleSave = async () => {
    if (!appointment) return;

    setLoading(true);
    try {
      await editAppointment(appointment.id, {
        ...formData,
        guest_phone: normalizePhoneToE164(formData.guest_phone) || formData.guest_phone,
      });

      toast.success("Appointment updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message || "Failed to update appointment");
    } finally {
      setLoading(false);
    }
  };

  if (!appointment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Edit Appointment
          </DialogTitle>
          <DialogDescription>
            Update appointment details. Changes will be saved immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Service Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Oil Change"
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={formData.scheduled_time}
                onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
              />
            </div>
          </div>

          {/* Duration & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Customer Info */}
          <div className="space-y-2">
            <Label>Customer Information</Label>
            <div className="grid grid-cols-1 gap-3">
              <Input
                placeholder="Customer Name"
                value={formData.guest_name}
                onChange={(e) => setFormData({ ...formData, guest_name: e.target.value })}
              />
              <Input
                type="email"
                placeholder="Email"
                value={formData.guest_email}
                onChange={(e) => setFormData({ ...formData, guest_email: e.target.value })}
              />
              <Input
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.guest_phone}
                onChange={(e) => setFormData({ ...formData, guest_phone: formatPhoneInput(e.target.value) })}
              />
            </div>
          </div>

          {/* Service Location */}
          <div className="space-y-2">
            <Label htmlFor="location_address">Service Location Address</Label>
            <Input
              id="location_address"
              placeholder="Street address where service will be performed"
              value={formData.location_address}
              onChange={(e) => setFormData({ ...formData, location_address: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Snapshot for this appointment. Defaults to the customer's address.
            </p>
          </div>

          {/* Estimated Cost */}
          <div className="space-y-2">
            <Label htmlFor="cost">Estimated Cost ($)</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              value={formData.estimated_cost}
              onChange={(e) =>
                setFormData({ ...formData, estimated_cost: bankersRound(Number(e.target.value) || 0, 2) })
              }
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add any special instructions or notes..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
