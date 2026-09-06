import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { supabase } from "@/integrations/supabase/client";

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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function fetchShopWeatherContext(): Promise<{
  lat: number | null;
  lng: number | null;
  address: string | null;
  weatherGuardEnabled: boolean;
  settings: unknown;
} | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("address_line1, address_line2, city, region, postal_code, operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error || !data) return null;

  const operational = asObject(data.operational_settings);
  const weather = asObject(operational.weather_guard);
  const coordinates = asObject(weather.coordinates);
  return {
    lat: typeof coordinates.lat === "number" ? coordinates.lat : null,
    lng: typeof coordinates.lng === "number" ? coordinates.lng : null,
    address: [data.address_line1, data.address_line2, data.city, data.region, data.postal_code].filter(Boolean).join(", ") || null,
    weatherGuardEnabled: weather.enabled === true,
    settings: weather.settings ?? weather,
  };
}

export async function ensureDefaultRules(): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) return;
  await supabase.rpc("seed_default_dispatch_rules", { _user_id: context.userId });
}

export async function fetchDispatchRules(): Promise<DispatchRule[]> {
  const { data, error } = await supabase.from("dispatch_rules").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DispatchRule[];
}

export async function updateDispatchRule(id: string, patch: Partial<Pick<DispatchRule, "active" | "auto_execute" | "name" | "condition" | "action">>): Promise<void> {
  const { error } = await supabase.from("dispatch_rules").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function fetchUpcomingAtRisk(): Promise<AtRiskAppointment[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const now = new Date();
  const horizon = new Date(Date.now() + 48 * 3_600_000);
  const { data, error } = await supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status, metadata")
    .eq("workspace_id", context.workspaceId)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", horizon.toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((appointment) => {
    const metadata = asObject(appointment.metadata);
    const start = new Date(appointment.starts_at);
    const end = new Date(appointment.ends_at);
    return {
      id: appointment.id,
      title: typeof metadata.title === "string" ? metadata.title : "Service appointment",
      scheduled_date: start.toISOString().slice(0, 10),
      scheduled_time: start.toTimeString().slice(0, 5),
      duration_minutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)),
      status: appointment.status,
      location_address: typeof metadata.location_address === "string" ? metadata.location_address : typeof metadata.service_address === "string" ? metadata.service_address : null,
      guest_name: typeof metadata.guest_name === "string" ? metadata.guest_name : null,
      weather_risk_score: typeof metadata.weather_risk_score === "number" ? metadata.weather_risk_score : null,
      weather_decision: typeof metadata.weather_decision === "string" ? metadata.weather_decision : null,
      weather_evaluated_at: typeof metadata.weather_evaluated_at === "string" ? metadata.weather_evaluated_at : null,
    };
  });
}

export async function fetchRecentRiskLogs(limit = 20): Promise<WeatherRiskLog[]> {
  const { data, error } = await supabase.from("weather_risk_logs").select("*").order("evaluated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as WeatherRiskLog[];
}

export async function evaluateAppointmentNow(appointmentId: string) {
  const { data, error } = await supabase.functions.invoke("weather-guard-evaluate", { body: { appointmentId } });
  if (error) throw error;
  return data;
}

export async function executeWeatherAction(appointmentId: string, decision: WeatherDecision, reason: string) {
  const { data, error } = await supabase.functions.invoke("weather-guard-action", { body: { appointmentId, decision, reason } });
  if (error) throw error;
  return data;
}

export async function checkSlotRisk(args: { businessUserId?: string; lat: number; lng: number; start: string; end?: string; scope?: "all" | "outdoor" | "mobile"; }) {
  const { data, error } = await supabase.functions.invoke("weather-guard-check-slot", { body: args });
  if (error) throw error;
  return data as { riskScore: number; riskLevel: RiskLevel; decision: WeatherDecision; message: string; reasons?: string[]; };
}

export function subscribeWeatherRiskLogs(onInsert: () => void): { unsubscribe: () => void } {
  const channel = supabase.channel("weather-risk-logs").on("postgres_changes", { event: "INSERT", schema: "public", table: "weather_risk_logs" }, () => onInsert()).subscribe();
  return { unsubscribe: () => { void supabase.removeChannel(channel); } };
}
