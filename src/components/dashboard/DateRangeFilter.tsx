import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

export type DateRangePreset = "7d" | "30d" | "90d" | "thisMonth" | "lastMonth" | "custom";

interface DateRangeFilterProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
}

const presetOptions: { value: DateRangePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "custom", label: "Custom" },
];

export function getDateRangeFromPreset(preset: DateRangePreset): DateRange {
  const today = new Date();
  switch (preset) {
    case "7d":
      return { from: subDays(today, 7), to: today };
    case "30d":
      return { from: subDays(today, 30), to: today };
    case "90d":
      return { from: subDays(today, 90), to: today };
    case "thisMonth":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "lastMonth": {
      const lastMonth = subMonths(today, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    default:
      return { from: subDays(today, 30), to: today };
  }
}

export function DateRangeFilter({
  dateRange,
  onDateRangeChange,
  preset,
  onPresetChange,
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handlePresetClick = (newPreset: DateRangePreset) => {
    onPresetChange(newPreset);
    if (newPreset !== "custom") {
      onDateRangeChange(getDateRangeFromPreset(newPreset));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 flex-wrap">
        {presetOptions.slice(0, -1).map((option) => (
          <Button
            key={option.value}
            variant={preset === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetClick(option.value)}
            className="text-xs"
          >
            {option.label}
          </Button>
        ))}
      </div>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={preset === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "justify-start text-left font-normal text-xs gap-2",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                </>
              ) : (
                format(dateRange.from, "MMM d, yyyy")
              )
            ) : (
              "Custom range"
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={(range) => {
              onDateRangeChange(range);
              onPresetChange("custom");
              if (range?.from && range?.to) {
                setIsOpen(false);
              }
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
