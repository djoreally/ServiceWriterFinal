import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock } from "lucide-react";

interface DayHours {
  open: string;
  close: string;
  isOpen: boolean;
}

interface WorkingHoursData {
  working_days: string[];
  opening_time: string;
  closing_time: string;
  day_hours: Record<string, DayHours>;
}

interface WorkingHoursStepProps {
  data: WorkingHoursData;
  onUpdate: (data: Partial<WorkingHoursData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const TIME_OPTIONS = [
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00",
];

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
};

export const WorkingHoursStep = ({ data, onUpdate, onNext, onBack }: WorkingHoursStepProps) => {
  const toggleDay = (dayKey: string) => {
    const currentHours = data.day_hours[dayKey] || { open: "09:00", close: "17:00", isOpen: false };
    onUpdate({
      day_hours: {
        ...data.day_hours,
        [dayKey]: { ...currentHours, isOpen: !currentHours.isOpen },
      },
    });
  };

  const updateDayTime = (dayKey: string, field: "open" | "close", value: string) => {
    const currentHours = data.day_hours[dayKey] || { open: "09:00", close: "17:00", isOpen: true };
    onUpdate({
      day_hours: {
        ...data.day_hours,
        [dayKey]: { ...currentHours, [field]: value },
      },
    });
  };

  const applyPreset = (preset: "standard" | "extended") => {
    const presetHours: Record<string, DayHours> = {};
    
    if (preset === "standard") {
      DAYS.forEach((day) => {
        const isWeekday = !["saturday", "sunday"].includes(day.key);
        presetHours[day.key] = {
          open: "09:00",
          close: "17:00",
          isOpen: isWeekday,
        };
      });
    } else {
      DAYS.forEach((day) => {
        presetHours[day.key] = {
          open: "08:00",
          close: "18:00",
          isOpen: day.key !== "sunday",
        };
      });
    }
    
    onUpdate({ day_hours: presetHours });
  };

  const hasAtLeastOneDay = Object.values(data.day_hours).some((d) => d.isOpen);

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">When are you available?</CardTitle>
        <CardDescription className="text-base">
          Set your working hours so customers can book appointments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-lg mx-auto">
        {/* Quick presets */}
        <div className="flex gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset("standard")}
          >
            Standard Week (Mon-Fri 9-5)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset("extended")}
          >
            Extended Hours
          </Button>
        </div>

        {/* Day-by-day settings */}
        <div className="space-y-3">
          {DAYS.map((day) => {
            const dayData = data.day_hours[day.key] || { open: "09:00", close: "17:00", isOpen: false };
            
            return (
              <div
                key={day.key}
                className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-2 w-28">
                  <Switch
                    checked={dayData.isOpen}
                    onCheckedChange={() => toggleDay(day.key)}
                  />
                  <Label className="font-medium">{day.label}</Label>
                </div>

                {dayData.isOpen ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Select
                      value={dayData.open}
                      onValueChange={(v) => updateDayTime(day.key, "open", v)}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {formatTime(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">to</span>
                    <Select
                      value={dayData.close}
                      onValueChange={(v) => updateDayTime(day.key, "close", v)}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {formatTime(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Closed</span>
                )}
              </div>
            );
          })}
        </div>

        {!hasAtLeastOneDay && (
          <p className="text-sm text-destructive text-center">
            Please enable at least one day
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button onClick={onNext} className="flex-1" disabled={!hasAtLeastOneDay}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
