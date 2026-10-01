import { apiClient } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export type RiskLevel = "low" | "medium" | "high" | "extreme";
export type WeatherDecision = "OK" | "WARN" | "SUGGEST_RESCHEDULE" | "BLOCK";

export interface DispatchRule {
  id: string;
  user_id: string;
  name: string;
  condition: { weather_risk_gte?: number; scope?: string };
  action: "warn" | "suggest_reschedule" | "block" | "reroute";
  auto_execute: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeatherRiskLog {
  id: string;
  user_id: string;
  appointment_id: string;
  snapshot_id: string | null;
  risk_score: number;
  risk_level: RiskLevel;
  decision: WeatherDecision;
  reason: string | null;
  evaluated_at: string;
}

export interface AtRiskAppointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  location_address: string | null;
  guest_name: string | null;
  weather_risk_score: number | null;
  weather_decision: string | null;
  weather_evaluated_at: string | null;
}

/** Fetch the current user's shop coordinates + weather settings (for the map). */
export async function fetchShopWeatherContext(): Promise<{
  lat: number | null;
  lng: number | null;
  address: string | null;
  weatherGuardEnabled: boolean;
  settings: unknown;
} | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  return apiClient.get<{
    lat: number | null;
    lng: number | null;
    address: string | null;
    weatherGuardEnabled: boolean;
    settings: unknown;
  } | null>("/v1/platform/weather-guard/shop-context");
}

/** Ensure default rules exist for the current user. */
export async function ensureDefaultRules(): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return;
  await apiClient.post("/v1/platform/weather-guard/seed-rules", {});
}

export async function fetchDispatchRules(): Promise<DispatchRule[]> {
  return apiClient.get<DispatchRule[]>("/v1/platform/weather-guard/dispatch-rules");
}

export async function updateDispatchRule(
  id: string,
  patch: Partial<Pick<DispatchRule, "active" | "auto_execute" | "name" | "condition" | "action">>,
): Promise<void> {
  await apiClient.patch(`/v1/platform/weather-guard/dispatch-rules/${encodeURIComponent(id)}`, patch);
}

export async function fetchUpcomingAtRisk(): Promise<AtRiskAppointment[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 48 * 3_600_000).toISOString().slice(0, 10);

  return apiClient.get<AtRiskAppointment[]>("/v1/platform/weather-guard/at-risk", {
    query: { today, horizon },
  });
}

export async function fetchRecentRiskLogs(limit = 20): Promise<WeatherRiskLog[]> {
  return apiClient.get<WeatherRiskLog[]>("/v1/platform/weather-guard/risk-logs", {
    query: { limit },
  });
}

export async function evaluateAppointmentNow(appointmentId: string) {
  return apiClient.post("/v1/platform/weather-guard/evaluate", { appointmentId });
}

export async function executeWeatherAction(
  appointmentId: string,
  decision: WeatherDecision,
  reason: string,
) {
  return apiClient.post("/v1/platform/weather-guard/action", { appointmentId, decision, reason });
}

export async function checkSlotRisk(args: {
  businessUserId?: string;
  lat: number;
  lng: number;
  start: string;
  end?: string;
  scope?: "all" | "outdoor" | "mobile";
}) {
  return apiClient.post<{
    riskScore: number;
    riskLevel: RiskLevel;
    decision: WeatherDecision;
    message: string;
    reasons?: string[];
  }>("/v1/platform/weather-guard/check-slot", args);
}

/** Subscribe to weather_risk_logs INSERTs; used by the guard dashboard to refresh live. */
export function subscribeWeatherRiskLogs(onInsert: () => void): { unsubscribe: () => void } {
  const channel = supabase
    .channel("weather-risk-logs")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "weather_risk_logs" },
      () => onInsert(),
    )
    .subscribe();
  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
