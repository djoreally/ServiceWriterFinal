/**
 * BusinessHoursSection - Operating hours and working days
 */

import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface BusinessHoursData {
  opening_time: string;
  closing_time: string;
  working_days: string[];
}

interface BusinessHoursSectionProps {
  hours: BusinessHoursData;
  onHoursChange: (updates: Partial<BusinessHoursData>) => void;
}

export function BusinessHoursSection({ hours, onHoursChange }: BusinessHoursSectionProps) {
  const handleWorkingDayToggle = (day: string, checked: boolean) => {
    if (checked) {
      onHoursChange({ working_days: [...hours.working_days, day] });
    } else {
      onHoursChange({ working_days: hours.working_days.filter(d => d !== day) });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Business Hours
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Set your shop's operating hours and working days
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="opening_time">Opening Time</Label>
            <Input
              id="opening_time"
              type="time"
              value={hours.opening_time}
              onChange={(e) => onHoursChange({ opening_time: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="closing_time">Closing Time</Label>
            <Input
              id="closing_time"
              type="time"
              value={hours.closing_time}
              onChange={(e) => onHoursChange({ closing_time: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Working Days</Label>
          <div className="flex flex-wrap gap-3">
            {DAYS_OF_WEEK.map(day => (
              <label key={day} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={hours.working_days.includes(day)}
                  onCheckedChange={(checked) => handleWorkingDayToggle(day, !!checked)}
                />
                <span className="text-sm">{day}</span>
              </label>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
