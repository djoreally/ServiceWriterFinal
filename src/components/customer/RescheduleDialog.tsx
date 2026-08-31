import { errorMessage } from "@/lib/error-message";
import { useState } from "react";
import { rescheduleAppointment } from "@/application/commands/customer-portal.command";
import { sendBookingLifecycleSms } from "@/application/commands/sms.command";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Calendar as CalendarIcon, Clock } from "lucide-react";
import { format, isBefore, startOfToday } from "date-fns";
import { formatTimeLabel, formatDateLabel } from "@/lib/datetime";

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

// Generate 30-minute time slots from 8:00 AM to 6:00 PM
const TIME_SLOTS = Array.from({ length: 21 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8;
  const min = i % 2 === 0 ? "00" : "30";
  return `${hour.toString().padStart(2, "0")}:${min}`;
}).filter((t) => t <= "18:00");

export function RescheduleDialog({
  appointment,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime || !appointment.management_token) return;

    setSubmitting(true);

    const newDate = format(selectedDate, "yyyy-MM-dd");
    const newTime = selectedTime + ":00";

    try {
      const result = await rescheduleAppointment(
        appointment.management_token,
        newDate,
        newTime,
      );

      if (!result.success) {
        toast.error(
          result.message ||
            "Unable to reschedule. The shop may not allow rescheduling or the window has passed."
        );
        return;
      }

      toast.success("Appointment rescheduled successfully");
      // Signature should be provided by backend
      const sig = "";
      sendBookingLifecycleSms({ appointmentId: appointment.id, type: "reschedule", signature: sig || undefined })
        .catch((e) => console.warn("[reschedule-sms] failed", e));
      onSuccess();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Failed to reschedule appointment"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Reschedule Appointment
          </DialogTitle>
          <DialogDescription>
            Choose a new date and time for &ldquo;
            {appointment.service_catalog?.name || appointment.title}&rdquo;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date Picker */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Select a new date
            </label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) =>
                isBefore(date, startOfToday()) || date.getDay() === 0
              }
              className="rounded-md border mx-auto"
            />
          </div>

          {/* Time Picker */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Select a time
            </label>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a time slot">
                  {selectedTime ? (
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {format(
                        new Date(`2000-01-01T${selectedTime}`),
                        "h:mm a"
                      )}
                    </span>
                  ) : (
                    "Choose a time slot"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {formatTimeLabel(slot, "h:mm a")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedDate || !selectedTime || submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
