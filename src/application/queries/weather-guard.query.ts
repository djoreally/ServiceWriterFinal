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
  const { data, error } = await (supabase
    .from("business_profiles")
    .select("service_address, service_coordinates, weather_guard_enabled, weather_guard_settings") as any)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  const coords = (data.service_coordinates ?? null) as { lat?: number; lng?: number } | null;
  return {
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    address: data.service_address ?? null,
    weatherGuardEnabled: data.weather_guard_enabled ?? false,
    settings: data.weather_guard_settings ?? null,
  };
}

/** Ensure default rules exist for the current user. */
export async function ensureDefaultRules(): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return;
  await supabase.rpc("seed_default_dispatch_rules", { _user_id: user.id });
}

export async function fetchDispatchRules(): Promise<DispatchRule[]> {
  const { data, error } = await supabase
    .from("dispatch_rules")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DispatchRule[];
}

export async function updateDispatchRule(
  id: string,
  patch: Partial<Pick<DispatchRule, "active" | "auto_execute" | "name" | "condition" | "action">>,
): Promise<void> {
  const { error } = await supabase.from("dispatch_rules").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function fetchUpcomingAtRisk(): Promise<AtRiskAppointment[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 48 * 3_600_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, title, scheduled_date, scheduled_time, duration_minutes, status, location_address, guest_name, weather_risk_score, weather_decision, weather_evaluated_at",
    )
    .gte("scheduled_date", today)
    .lte("scheduled_date", horizon)
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AtRiskAppointment[];
}

export async function fetchRecentRiskLogs(limit = 20): Promise<WeatherRiskLog[]> {
  const { data, error } = await supabase
    .from("weather_risk_logs")
    .select("*")
    .order("evaluated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as WeatherRiskLog[];
}

export async function evaluateAppointmentNow(appointmentId: string) {
  const { data, error } = await supabase.functions.invoke("weather-guard-evaluate", {
    body: { appointmentId },
  });
  if (error) throw error;
  return data;
}

export async function executeWeatherAction(
  appointmentId: string,
  decision: WeatherDecision,
  reason: string,
) {
  const { data, error } = await supabase.functions.invoke("weather-guard-action", {
    body: { appointmentId, decision, reason },
  });
  if (error) throw error;
  return data;
}

export async function checkSlotRisk(args: {
  businessUserId?: string;
  lat: number;
  lng: number;
  start: string;
  end?: string;
  scope?: "all" | "outdoor" | "mobile";
}) {
  const { data, error } = await supabase.functions.invoke("weather-guard-check-slot", { body: args });
  if (error) throw error;
  return data as {
    riskScore: number;
    riskLevel: RiskLevel;
    decision: WeatherDecision;
    message: string;
    reasons?: string[];
  };
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
