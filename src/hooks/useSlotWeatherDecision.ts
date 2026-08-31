/**
 * useSlotWeatherDecision — Consults the `weather-guard-check-slot` edge
 * function for the customer's selected slot in the public booking flow.
 *
 * Returns the structured decision (OK / WARN / SUGGEST_RESCHEDULE / BLOCK)
 * computed by the same risk engine that powers Weather Guard.
 *
 * The result is debounced and cached per (date, time) pair so flipping
 * between slots doesn't hammer the edge function.
 */

import { useEffect, useRef, useState } from "react";
import { format, parse } from "date-fns";
import { checkSlotRisk, type WeatherDecision, type RiskLevel } from "@/application/queries/weather-guard.query";

export interface SlotWeatherDecisionResult {
  riskScore: number;
  riskLevel: RiskLevel;
  decision: WeatherDecision;
  message: string;
}

interface Options {
  enabled: boolean;
  lat: number | null;
  lng: number | null;
  selectedDate: Date | undefined;
  selectedTime: string;
  durationMinutes: number;
  businessUserId?: string;
  /** outdoor (default), all, or mobile */
  scope?: "all" | "outdoor" | "mobile";
}

interface State {
  loading: boolean;
  result: SlotWeatherDecisionResult | null;
  error: string | null;
}

export function useSlotWeatherDecision({
  enabled,
  lat,
  lng,
  selectedDate,
  selectedTime,
  durationMinutes,
  businessUserId,
  scope = "outdoor",
}: Options): State & { dismiss: () => void; isBlocked: boolean; isReschedule: boolean } {
  const [state, setState] = useState<State>({ loading: false, result: null, error: null });
  const [dismissed, setDismissed] = useState(false);
  const cacheRef = useRef<Map<string, SlotWeatherDecisionResult>>(new Map());

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const cacheKey = `${businessUserId ?? "public"}|${dateStr}|${selectedTime}|${scope}`;

  useEffect(() => {
    void Promise.resolve().then(() => setDismissed(false));
  }, [cacheKey]);

  useEffect(() => {
    if (!enabled || !selectedDate || !selectedTime || lat == null || lng == null) {
      void Promise.resolve().then(() => setState({ loading: false, result: null, error: null }));
      return;
    }

    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      void Promise.resolve().then(() => setState({ loading: false, result: cached, error: null }));
      return;
    }

    let cancelled = false;
    const startDate = parse(`${dateStr} ${selectedTime}`, "yyyy-MM-dd HH:mm", new Date());
    const start = startDate.toISOString();
    const end = new Date(startDate.getTime() + durationMinutes * 60_000).toISOString();

    void Promise.resolve().then(() => setState((s) => ({ ...s, loading: true, error: null })));

    const timer = setTimeout(async () => {
      try {
        const r = await checkSlotRisk({ businessUserId, lat, lng, start, end, scope });
        if (cancelled) return;
        cacheRef.current.set(cacheKey, r);
        setState({ loading: false, result: r, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, result: null, error: (e as Error).message });
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, businessUserId, lat, lng, dateStr, selectedTime, cacheKey, durationMinutes, scope, selectedDate]);

  return {
    ...state,
    dismiss: () => setDismissed(true),
    isBlocked: !dismissed && state.result?.decision === "BLOCK",
    isReschedule: !dismissed && state.result?.decision === "SUGGEST_RESCHEDULE",
  };
}
