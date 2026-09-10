/**
 * DateTimeStep - Step 4: Date & Time Selection
 * Uses a single mobile-first date rail followed by appointment windows.
 */

import { memo, useMemo } from "react";
import { CalendarIcon, Clock, Loader2, Shield, AlertTriangle, CloudRain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isOperatingDay } from "@/lib/business-hours";
import { format, isBefore, startOfDay, addDays, parse, addMinutes } from "date-fns";
import type { WeatherBlockedSlot } from "@/lib/weather-guard";
import type { SlotWeatherDecisionResult } from "@/hooks/useSlotWeatherDecision";

function formatSlotRange(slot: string, slotDurationMinutes: number): string {
  try {
    const start = parse(slot, "HH:mm", new Date());
    const end = addMinutes(start, slotDurationMinutes);
    const fmt = (date: Date) => format(date, date.getMinutes() === 0 ? "h a" : "h:mm a");
    return `${fmt(start)} - ${fmt(end)}`;
  } catch {
    return slot;
  }
}

interface BookedSlot {
  scheduled_time: string;
  duration_minutes: number;
}

interface DateTimeStepProps {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  selectedTime: string;
  setSelectedTime: (time: string) => void;
  bookedSlots: BookedSlot[];
  loadingSlots: boolean;
  workingDays: string[] | null;
  dayHours?: Record<string, unknown> | null;
  maxAdvanceDays: number;
  slotDurationMinutes: number;
  blockedDates?: string[];
  timeSlots: string[];
  isSlotBlocked: (slotTime: string) => boolean;
  isSlotTooSoon: (slotTime: string) => boolean;
  isWeatherBlocked?: (slotTime: string) => { blocked: boolean; reasons: string[] };
  isDayWeatherBlocked?: (date: Date) => boolean;
  weatherBlockedSlots?: WeatherBlockedSlot[];
  weatherLoading?: boolean;
  weatherError?: string | null;
  slotDecision?: SlotWeatherDecisionResult | null;
  slotDecisionLoading?: boolean;
  onAcknowledgeReschedule?: () => void;
  onClearSlot?: () => void;
  suggestedSlots?: Array<{
    date: Date;
    time: string;
    dateLabel: string;
    timeLabel: string;
    riskScore: number;
    decision: "OK" | "WARN";
  }>;
  suggestionsLoading?: boolean;
  suggestionsError?: string | null;
  onRequestSuggestions?: () => void;
  onSelectSuggestion?: (date: Date, time: string) => void;
  formatCurrency: (amount: number) => string;
  getTotalDuration: () => number;
  getTotalPrice: () => number;
  selectedServiceNames: string;
}

export const DateTimeStep = memo(function DateTimeStep({
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  loadingSlots,
  workingDays,
  dayHours,
  maxAdvanceDays,
  slotDurationMinutes,
  blockedDates = [],
  timeSlots,
  isSlotBlocked,
  isSlotTooSoon,
  isWeatherBlocked,
  isDayWeatherBlocked,
  weatherBlockedSlots = [],
  weatherLoading = false,
  weatherError = null,
  slotDecision = null,
  slotDecisionLoading = false,
  onAcknowledgeReschedule,
  onClearSlot,
  suggestedSlots = [],
  suggestionsLoading = false,
  suggestionsError = null,
  onRequestSuggestions,
  onSelectSuggestion,
  formatCurrency,
  getTotalDuration,
  getTotalPrice,
}: DateTimeStepProps) {
  const today = startOfDay(new Date());
  const blockedDateSet = useMemo(() => new Set(blockedDates), [blockedDates]);

  const isWorkingDay = (date: Date) => isOperatingDay(dayHours, workingDays, date);
  const isDateBlocked = (date: Date) => blockedDateSet.has(format(date, "yyyy-MM-dd"));
  const isDateWithinWindow = (date: Date) => !isBefore(addDays(today, maxAdvanceDays), date);

  const availableDates = useMemo(
    () => Array.from({ length: Math.max(maxAdvanceDays, 1) + 1 }, (_, index) => addDays(today, index)),
    [maxAdvanceDays, today.getTime()],
  );

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime("");
  };

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      <section className="min-w-0">
        <div className="mb-5 text-center">
          <CalendarIcon className="mx-auto mb-3 h-12 w-12 text-primary" />
          <h2 className="mb-2 text-2xl font-bold">Choose your date</h2>
          <p className="text-muted-foreground">Select one available date, then choose an appointment window.</p>
        </div>

        <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
          <div
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch]"
            aria-label="Available appointment dates"
          >
            {availableDates.map((date) => {
              const disabled =
                !isDateWithinWindow(date) ||
                !isWorkingDay(date) ||
                isDateBlocked(date) ||
                (isDayWeatherBlocked?.(date) ?? false);
              const selected = selectedDate?.toDateString() === date.toDateString();

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDate(date)}
                  aria-pressed={selected}
                  className={cn(
                    "min-h-[78px] min-w-[76px] snap-start rounded-xl border px-3 py-2 text-center transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    selected && "border-primary bg-primary text-primary-foreground shadow-md",
                    !selected && !disabled && "bg-background hover:border-primary hover:bg-primary/5",
                    disabled && "cursor-not-allowed bg-muted/50 text-muted-foreground opacity-45",
                  )}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide">{format(date, "EEE")}</span>
                  <span className="block text-2xl font-bold leading-7">{format(date, "d")}</span>
                  <span className="block text-[11px] font-medium">{format(date, "MMM")}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Swipe to see more dates</span>
            {selectedDate ? <span className="font-medium text-foreground">{format(selectedDate, "EEE, MMM d")}</span> : null}
          </div>
        </div>
      </section>

      <section className="min-w-0">
        <Card className="w-full max-w-full overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Select Your Appointment Window
            </CardTitle>
            {selectedDate ? (
              <p className="text-sm text-muted-foreground">{format(selectedDate, "EEEE, MMMM d")}</p>
            ) : null}
          </CardHeader>
          <CardContent>
            {loadingSlots || weatherLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : selectedDate ? (
              <>
                {timeSlots.length > 0 ? (
                  <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
                    {timeSlots.map((slot) => {
                      const isBlocked = isSlotBlocked(slot);
                      const isTooSoon = isSlotTooSoon(slot);
                      const weather = isWeatherBlocked?.(slot) ?? { blocked: false, reasons: [] };
                      const isDisabled = isBlocked || isTooSoon || weather.blocked;

                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => !isDisabled && setSelectedTime(slot)}
                          disabled={isDisabled}
                          title={weather.blocked ? `Blocked: ${weather.reasons.join(", ")}` : undefined}
                          className={cn(
                            "relative flex min-h-[58px] w-full min-w-0 items-center justify-center rounded-xl border px-2 py-3 text-center text-[13px] leading-tight transition-colors sm:text-sm",
                            selectedTime === slot && "border-primary bg-primary text-primary-foreground",
                            !isDisabled && selectedTime !== slot && "hover:border-primary hover:bg-primary/5",
                            isDisabled && "cursor-not-allowed bg-muted opacity-40 line-through",
                          )}
                        >
                          {formatSlotRange(slot, Math.max(slotDurationMinutes, getTotalDuration(), 15))}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No appointment windows are available for this date. Choose another date.
                  </div>
                )}

                {weatherBlockedSlots.length > 0 && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2">
                    <div className="flex items-start gap-2">
                      <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                      <p className="text-xs text-blue-700">
                        Some times are unavailable because of weather conditions.
                      </p>
                    </div>
                  </div>
                )}

                {weatherError && (
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Weather forecast unavailable</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">You can still book. We will re-check the forecast closer to the appointment.</p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTime && slotDecisionLoading && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/30 p-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Checking weather risk for this time…</p>
                  </div>
                )}

                {selectedTime && slotDecision?.decision === "BLOCK" && (
                  <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-destructive">This time is unavailable due to weather</p>
                        <p className="mt-0.5 text-xs text-destructive/80">{slotDecision.message}</p>
                        {onClearSlot ? (
                          <Button size="sm" variant="outline" className="mt-2 h-8" onClick={onClearSlot}>Choose another time</Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {selectedTime && slotDecision?.decision === "SUGGEST_RESCHEDULE" && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
                    <div className="flex items-start gap-2">
                      <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Weather may impact this appointment</p>
                        <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">{slotDecision.message}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {onRequestSuggestions ? (
                            <Button size="sm" onClick={onRequestSuggestions} disabled={suggestionsLoading}>
                              {suggestionsLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              Suggest another time
                            </Button>
                          ) : null}
                          {onClearSlot ? <Button size="sm" variant="outline" onClick={onClearSlot}>Choose another time</Button> : null}
                          {onAcknowledgeReschedule ? <Button size="sm" variant="ghost" onClick={onAcknowledgeReschedule}>Continue anyway</Button> : null}
                        </div>

                        {suggestionsError ? <p className="mt-2 text-xs text-destructive">{suggestionsError}</p> : null}

                        {suggestedSlots.length > 0 ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {suggestedSlots.map((suggestion) => (
                              <button
                                key={`${suggestion.dateLabel}-${suggestion.time}`}
                                type="button"
                                onClick={() => onSelectSuggestion?.(suggestion.date, suggestion.time)}
                                className="rounded-lg border bg-background px-3 py-2 text-left hover:border-primary"
                              >
                                <p className="text-sm font-medium">{suggestion.dateLabel}</p>
                                <p className="text-xs text-muted-foreground">{suggestion.timeLabel}</p>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {selectedTime && slotDecision?.decision === "WARN" && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700">
                    {slotDecision.message}
                  </div>
                )}
              </>
            ) : (
              <p className="py-8 text-center text-muted-foreground">Select a date above to see available appointment windows.</p>
            )}
          </CardContent>
        </Card>

        {selectedDate && selectedTime ? (
          <Card className="mt-4 border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{format(selectedDate, "EEEE, MMMM d")}</p>
                  <p className="text-sm text-muted-foreground">{formatSlotRange(selectedTime, slotDurationMinutes)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{getTotalDuration()} min</p>
                  <p className="font-semibold text-primary">{formatCurrency(getTotalPrice())}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
});
