/**
 * Vehicle Recommendations Queries & Commands
 * Handles maintenance recommendation CRUD and auto-generation from service history.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface Recommendation {
  id: string;
  vehicle_id: string;
  recommendation_type: string;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  due_mileage: number | null;
  due_date: string | null;
  is_dismissed: boolean;
  last_service_mileage: number | null;
  last_service_date: string | null;
  interval_miles: number | null;
  interval_months: number | null;
}

export interface MaintenanceInterval {
  id: string;
  service_type: string;
  title: string;
  description: string | null;
  default_interval_miles: number | null;
  default_interval_months: number | null;
  priority: "high" | "medium" | "low";
}

export async function fetchVehicleRecommendations(vehicleId: string): Promise<Recommendation[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("vehicle_recommendations")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .eq("user_id", user.id)
    .eq("is_dismissed", false)
    .order("priority", { ascending: true });

  if (error || !data) return [];

  return (data as Recommendation[]).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
  });
}

export async function fetchMaintenanceIntervals(): Promise<MaintenanceInterval[]> {
  const { data } = await supabase.from("maintenance_intervals").select("*").order("title");
  return (data || []) as MaintenanceInterval[];
}

export async function dismissRecommendation(id: string): Promise<void> {
  const { error } = await supabase
    .from("vehicle_recommendations")
    .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("Failed to dismiss");
}

export async function deleteRecommendation(id: string): Promise<void> {
  const { error } = await supabase.from("vehicle_recommendations").delete().eq("id", id);
  if (error) throw new Error("Failed to mark complete");
}

export async function addRecommendation(rec: {
  vehicle_id: string;
  recommendation_type: string;
  title: string;
  description?: string | null;
  priority: string;
  due_mileage?: number | null;
  due_date?: string | null;
  interval_miles?: number | null;
  interval_months?: number | null;
}): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("vehicle_recommendations").insert([{
    ...rec,
    user_id: user.id,
  }]);
  if (error) throw new Error("Failed to add recommendation");
}

/**
 * Generate recommendations by analyzing service history against maintenance intervals.
 */
export async function generateRecommendationsFromHistory(
  vehicleId: string,
  currentMileage: number | null,
  intervals: MaintenanceInterval[]
): Promise<number> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return 0;

  const [servicesRes, existingRes] = await Promise.all([
    supabase.from("services").select("*").eq("vehicle_id", vehicleId).eq("user_id", user.id).order("service_date", { ascending: false }),
    supabase.from("vehicle_recommendations").select("recommendation_type").eq("vehicle_id", vehicleId).eq("user_id", user.id).eq("is_dismissed", false),
  ]);

  const services = servicesRes.data || [];
  const existingTypes = new Set((existingRes.data || []).map(r => r.recommendation_type));

  const { addMonths, format, isBefore, addDays } = await import("date-fns");
  const newRecs: any[] = [];

  for (const interval of intervals) {
    if (existingTypes.has(interval.service_type)) continue;

    const lastService = services.find(s =>
      s.service_type?.toLowerCase().includes(interval.service_type.replace("_", " ")) ||
      s.description?.toLowerCase().includes(interval.service_type.replace("_", " "))
    );

    let dueMileage: number | null = null;
    let dueDate: string | null = null;
    let shouldAdd = false;

    if (lastService) {
      if (interval.default_interval_miles && currentMileage) {
        const lastMileage = currentMileage - interval.default_interval_miles;
        dueMileage = lastMileage + interval.default_interval_miles;
        if (currentMileage >= dueMileage - 500) shouldAdd = true;
      }
      if (interval.default_interval_months) {
        dueDate = format(addMonths(new Date(lastService.service_date), interval.default_interval_months), "yyyy-MM-dd");
        if (isBefore(new Date(dueDate), addDays(new Date(), 30))) shouldAdd = true;
      }
    } else {
      if (interval.default_interval_miles && currentMileage) {
        dueMileage = Math.ceil(currentMileage / interval.default_interval_miles) * interval.default_interval_miles;
        if (currentMileage >= dueMileage - 500) shouldAdd = true;
      }
    }

    if (shouldAdd) {
      newRecs.push({
        vehicle_id: vehicleId,
        recommendation_type: interval.service_type,
        title: interval.title,
        description: interval.description,
        priority: interval.priority,
        due_mileage: dueMileage,
        due_date: dueDate,
        interval_miles: interval.default_interval_miles,
        interval_months: interval.default_interval_months,
        last_service_mileage: null,
        last_service_date: lastService?.service_date || null,
        user_id: user.id,
      });
    }
  }

  if (newRecs.length > 0) {
    const { error } = await supabase.from("vehicle_recommendations").insert(newRecs);
    if (error) throw new Error("Failed to generate recommendations");
  }

  return newRecs.length;
}
