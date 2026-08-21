/**
 * DateTimeStep - Step 4: Date & Time Selection
 * Handles calendar and time slot selection
 * Includes Weather Guard integration for blocking adverse weather slots
 */

import { memo } from "react";
import { CalendarIcon, Clock, Loader2, Shield, AlertTriangle, CloudRain } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isOperatingDay, type DayHoursMap } from "@/lib/business-hours";
import { format, isBefore, startOfDay, addDays, parse, addMinutes } from "date-fns";
import type { WeatherBlockedSlot } from "@/lib/weather-guard";
import type { SlotWeatherDecisionResult } from "@/hooks/useSlotWeatherDecision";

/**
 * Convert "HH:mm" to an arrival-window label like "10 AM - 11 AM".
 * Minutes are included whenever a boundary isn't on the hour, so two distinct
 * start times (17:00 / 17:30) never render the same label.
 */
function formatSlotRange(slot: string, slotDurationMinutes: number): string {
  try {
    const start = parse(slot, "HH:mm", new Date());
    const end = addMinutes(start, slotDurationMinutes);
    const fmt = (d: Date) => format(d, d.getMinutes() === 0 ? "h a" : "h:mm a");
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
  /** Per-weekday hours; authoritative over `workingDays` when present. */
  dayHours?: Record<string, unknown> | null;
  maxAdvanceDays: number;
  slotDurationMinutes: number;
  /** ISO date strings (YYYY-MM-DD) the business has marked unavailable. */
  blockedDates?: string[];
  timeSlots: string[];
  isSlotBlocked: (slotTime: string) => boolean;
  isSlotTooSoon: (slotTime: string) => boolean;
  isWeatherBlocked?: (slotTime: string) => { blocked: boolean; reasons: string[] };
  /** Disables an entire day in the calendar if any operating hour is weather-blocked. */
  isDayWeatherBlocked?: (date: Date) => boolean;
  weatherBlockedSlots?: WeatherBlockedSlot[];
  weatherLoading?: boolean;
  weatherError?: string | null;
  /** Real-time decision from `weather-guard-check-slot` for the *currently selected* slot */
  slotDecision?: SlotWeatherDecisionResult | null;
  slotDecisionLoading?: boolean;
  /** Called when the customer acknowledges a "suggest reschedule" suggestion and continues anyway */
  onAcknowledgeReschedule?: () => void;
  /** Called when the customer chooses to pick a different time */
  onClearSlot?: () => void;
  /** Suggested alternative slots (computed when SUGGEST_RESCHEDULE) */
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

/** ⚡ Memoized — calendar + slot grid is expensive to re-render */
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
  selectedServiceNames,
}: DateTimeStepProps) {
  const isWorkingDay = (date: Date) => isOperatingDay(dayHours, workingDays, date);

  const isDateWithinWindow = (date: Date): boolean => {
    const maxDate = addDays(startOfDay(new Date()), maxAdvanceDays);
    return isBefore(date, maxDate);
  };

  const blockedDateSet = new Set(blockedDates);
  const isDateBlocked = (date: Date): boolean => {
    return blockedDateSet.has(format(date, "yyyy-MM-dd"));
  };


  return (
    <div className="grid md:grid-cols-2 gap-6 w-full max-w-full overflow-x-hidden">
      <div className="min-w-0">

        <div className="text-center md:text-left mb-6">
          <CalendarIcon className="h-12 w-12 mx-auto md:mx-0 text-primary mb-4" />
          <h2 className="text-2xl font-bold mb-2">Choose your date</h2>
          <p className="text-muted-foreground">Select your date, then select your time slot</p>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-2" aria-label="Quick date selection">
          {Array.from({ length: 7 }, (_, index) => addDays(startOfDay(new Date()), index)).map((date) => {
            const disabled = !isWorkingDay(date) || !isDateWithinWindow(date) || isDateBlocked(date) || (isDayWeatherBlocked?.(date) ?? false);
            const selected = selectedDate?.toDateString() === date.toDateString();
            return <button key={date.toISOString()} type="button" disabled={disabled} onClick={() => setSelectedDate(date)} className={cn("min-w-[66px] rounded-xl border px-3 py-2 text-center transition-all duration-200", selected && "-translate-y-0.5 border-primary bg-primary text-primary-foreground shadow-md", !selected && !disabled && "bg-card hover:border-primary", disabled && "opacity-35")}><span className="block text-[10px] font-semibold uppercase">{format(date, "EEE")}</span><span className="block text-lg font-bold">{format(date, "d")}</span></button>;
          })}
        </div>
        <Card className="w-full max-w-full overflow-hidden">
          <CardContent className="flex justify-center px-1 pt-4 sm:px-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) =>
                isBefore(date, startOfDay(new Date())) ||
                !isWorkingDay(date) ||
                !isDateWithinWindow(date) ||
                isDateBlocked(date) ||
                (isDayWeatherBlocked?.(date) ?? false)
              }
              modifiers={{
                blocked: (date) => isDateBlocked(date),
                weather: (date) => isDayWeatherBlocked?.(date) ?? false,
              }}
              modifiersClassNames={{
                blocked: "line-through text-muted-foreground/60",
                weather: "line-through text-muted-foreground/60",
              }}
              className="w-full max-w-full rounded-md border-0 p-0"
            />
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0">

        <Card className="w-full max-w-full overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Select Your Appointment Window
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(loadingSlots || weatherLoading) ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : selectedDate ? (
              <>
                <div className="grid w-full max-w-full grid-cols-2 gap-2 sm:grid-cols-3">
                  {timeSlots.map(slot => {
                    const isBlocked = isSlotBlocked(slot);
                    const isTooSoon = isSlotTooSoon(slot);
                    const weather = isWeatherBlocked?.(slot) ?? { blocked: false, reasons: [] };
                    // Fail-open: when the forecast can't be fetched (weatherError),
                    // do NOT block all slots — allow booking and surface a soft notice.
                    const isDisabled = isBlocked || isTooSoon || weather.blocked;
                    return (
                      <button
                        key={slot}
                        onClick={() => !isDisabled && setSelectedTime(slot)}
                        disabled={isDisabled}
                        title={weather.blocked ? `Blocked: ${weather.reasons.join(", ")}` : undefined}
                        className={cn(
                          "w-full min-w-0 min-h-[56px] px-2 py-3 text-[13px] sm:text-sm rounded-xl border transition-colors relative flex items-center justify-center text-center leading-tight break-words",
                          selectedTime === slot && "bg-primary text-primary-foreground border-primary",
                          !isDisabled && selectedTime !== slot && "hover:border-primary hover:bg-primary/5",
                          isDisabled && "opacity-40 cursor-not-allowed line-through bg-muted",
                          weather.blocked && !isBlocked && !isTooSoon && "border-blue-300 bg-blue-50/50"
                        )}
                      >
                        {weather.blocked && (
                          <span className="absolute -top-1 -right-1 text-xs">
                            {weather.reasons.some(r => r.toLowerCase().includes("snow")) ? "🌨️"
                              : weather.reasons.some(r => r.toLowerCase().includes("thunder")) ? "⛈️"
                              : weather.reasons.some(r => r.toLowerCase().includes("wind")) ? "💨"
                              : weather.reasons.some(r => r.toLowerCase().includes("fog")) ? "🌫️"
                              : "🌧️"}
                          </span>
                        )}
                        {formatSlotRange(slot, Math.max(slotDurationMinutes, getTotalDuration(), 15))}
                      </button>
                    );
                  })}
                </div>
                {weatherBlockedSlots.length > 0 && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2">
                    <div className="flex items-start gap-2">
                      <Shield className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-700">
                        Some slots blocked due to weather:
                        {" "}{[...new Set(weatherBlockedSlots.flatMap(s => s.reasons))].join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                {weatherError && (
                  <div className="mt-3 rounded-lg border border-muted bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <CloudRain className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Weather forecast unavailable</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          You can still book — we'll re-check the forecast closer to your appointment.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Real-time decision from weather-guard-check-slot for the chosen slot */}
                {selectedTime && slotDecisionLoading && (
                  <div className="mt-3 rounded-lg border border-muted bg-muted/30 p-2 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Checking weather risk for this slot…</p>
                  </div>
                )}

                {selectedTime && slotDecision && slotDecision.decision === "BLOCK" && (
                  <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-destructive">Slot unavailable due to weather</p>
                        <p className="text-xs text-destructive/80 mt-0.5">
                          {slotDecision.message} (risk score {slotDecision.riskScore})
                        </p>
                        {onClearSlot && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 text-xs"
                            onClick={onClearSlot}
                          >
                            Pick a different time
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {selectedTime && slotDecision && slotDecision.decision === "SUGGEST_RESCHEDULE" && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <CloudRain className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                          Weather may impact this appointment
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                          {slotDecision.message} (risk score {slotDecision.riskScore})
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {onRequestSuggestions && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs gap-1"
                              onClick={onRequestSuggestions}
                              disabled={suggestionsLoading}
                            >
                              {suggestionsLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CalendarIcon className="h-3 w-3" />
                              )}
                              Suggest next available time
                            </Button>
                          )}
                          {onClearSlot && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClearSlot}>
                              Choose another time
                            </Button>
                          )}
                          {onAcknowledgeReschedule && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onAcknowledgeReschedule}>
                              Continue anyway
                            </Button>
                          )}
                        </div>

                        {suggestionsError && (
                          <p className="mt-2 text-xs text-destructive">{suggestionsError}</p>
                        )}

                        {suggestedSlots.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[11px] uppercase tracking-wide font-semibold text-amber-900/80 dark:text-amber-200/80">
                              Better times nearby
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {suggestedSlots.map((s) => (
                                <button
                                  key={`${s.dateLabel}-${s.time}`}
                                  type="button"
                                  onClick={() => onSelectSuggestion?.(s.date, s.time)}
                                  className={cn(
                                    "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left",
                                    "bg-background/60 hover:bg-background border-amber-200/70 dark:border-amber-700/40",
                                    "transition-colors",
                                  )}
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate">{s.dateLabel}</p>
                                    <p className="text-[11px] text-muted-foreground">{s.timeLabel}</p>
                                  </div>
                                  <span
                                    className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded-md border",
                                      s.decision === "OK"
                                        ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                                        : "border-blue-300 text-blue-700 dark:text-blue-300",
                                    )}
                                  >
                                    {s.decision === "OK" ? "Clear" : "Mild risk"} · {s.riskScore}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {!suggestionsLoading &&
                          suggestedSlots.length === 0 &&
                          onRequestSuggestions === undefined && null}
                      </div>
                    </div>
                  </div>
                )}

                {selectedTime && slotDecision && slotDecision.decision === "WARN" && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2">
                    <div className="flex items-start gap-2">
                      <CloudRain className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-700">{slotDecision.message}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Please select a date first
              </p>
            )}
          </CardContent>
        </Card>

        {/* Selection Summary */}
        {selectedDate && selectedTime && (
          <Card className="mt-4 bg-primary/5 border-primary/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{format(selectedDate, "EEEE, MMMM d")}</p>
                  <p className="text-sm text-muted-foreground">
                    at {formatSlotRange(selectedTime, slotDurationMinutes)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{getTotalDuration()} min</p>
                  <p className="font-semibold text-primary">{formatCurrency(getTotalPrice())}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
});
