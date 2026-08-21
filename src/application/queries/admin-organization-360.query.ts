import { dollarsToCents, toDollars, type Cents } from "@/lib/money";
import { supabase } from "@/integrations/supabase/client";

export interface Organization360FeatureUsage {
  appointments: boolean;
  customers: boolean;
  inventory: boolean;
  reports: boolean;
  newsletter: boolean;
  marketplace: boolean;
}

export interface Organization360Profile {
  organizationId: string;
  organizationName: string;
  planName: string;
  mrrCents: Cents;
  daysActive: number;
  employeeCount: number;
  customerCount: number;
  vehicleCount: number;
  appointmentCount: number;
  completedAppointmentCount: number;
  revenueCents: Cents;
  featureUsage: Organization360FeatureUsage;
  healthScore: number;
  risk: "Low" | "Medium" | "High";
  lastActiveLabel: string;
  firstValueLabel: string;
  retentionRate: number;
}

function daysBetween(start: string | null, end = new Date()): number {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  if (!Number.isFinite(startTime)) return 0;
  return Math.max(Math.floor((end.getTime() - startTime) / 86_400_000), 0);
}

function formatLastActive(lastActiveAt: string | null): string {
  if (!lastActiveAt) return "Never";
  const days = daysBetween(lastActiveAt);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function formatFirstValue(createdAt: string | null, firstValueAt: string | null): string {
  if (!createdAt || !firstValueAt) return "Not yet";
  const created = new Date(createdAt).getTime();
  const firstValue = new Date(firstValueAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(firstValue) || firstValue < created) return "Not yet";
  const minutes = Math.round((firstValue - created) / 60_000);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

function getRisk(healthScore: number): Organization360Profile["risk"] {
  if (healthScore >= 80) return "Low";
  if (healthScore >= 60) return "Medium";
  return "High";
}

function calculateHealthScore(input: {
  daysSinceActive: number;
  retentionRate: number;
  firstValueLabel: string;
  completedAppointmentCount: number;
  customerCount: number;
  vehicleCount: number;
  revenueCents: Cents;
  featureUsage: Organization360FeatureUsage;
}): number {
  const featureCount = Object.values(input.featureUsage).filter(Boolean).length;
  let score = 0;
  if (input.daysSinceActive <= 14) score += 20;
  if (input.retentionRate >= 90) score += 20;
  else if (input.retentionRate >= 75) score += 12;
  if (input.firstValueLabel !== "Not yet") score += 15;
  if (input.completedAppointmentCount > 0) score += 15;
  if (input.customerCount > 0 && input.vehicleCount > 0) score += 10;
  if (input.revenueCents > 0) score += 10;
  if (featureCount >= 4) score += 10;
  else if (featureCount >= 2) score += 5;
  return Math.min(score, 100);
}

async function countRows(table: "appointments" | "customers" | "vehicles" | "inventory_items", userId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function countCompletedAppointments(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed");
  if (error) throw error;
  return count ?? 0;
}

export async function fetchOrganization360Profiles(): Promise<Organization360Profile[]> {
  const { data: profiles, error } = await supabase
    .from("business_profiles")
    .select("user_id, business_name, created_at, marketplace_opt_in, marketing_email_enabled")
    .not("business_name", "is", null)
    .neq("business_name", "")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!profiles?.length) return [];

  return Promise.all(profiles.map(async (profile) => {
    const userId = profile.user_id;
    const [
      customerCount,
      vehicleCount,
      appointmentCount,
      completedAppointmentCount,
      inventoryCount,
      teamCount,
      invoicesRes,
      lastAppointmentRes,
      firstCompletedRes,
      subscriptionRes,
    ] = await Promise.all([
      countRows("customers", userId),
      countRows("vehicles", userId),
      countRows("appointments", userId),
      countCompletedAppointments(userId),
      countRows("inventory_items", userId),
      supabase.from("team_user_links").select("id", { count: "exact", head: true }).eq("owner_user_id", userId),
      supabase.from("invoices").select("total, amount_paid").eq("user_id", userId).is("deleted_at", null),
      supabase.from("appointments").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("appointments").select("updated_at, actual_end_time").eq("user_id", userId).eq("status", "completed").order("updated_at", { ascending: true }).limit(1).maybeSingle(),
      supabase.from("business_subscriptions").select("plan_id, status").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (teamCount.error) throw teamCount.error;
    if (invoicesRes.error) throw invoicesRes.error;
    if (lastAppointmentRes.error) throw lastAppointmentRes.error;
    if (firstCompletedRes.error) throw firstCompletedRes.error;
    if (subscriptionRes.error) throw subscriptionRes.error;

    let planName = "Free";
    let mrrCents = dollarsToCents(toDollars(0));
    if (subscriptionRes.data?.plan_id) {
      const { data: plan, error: planError } = await supabase
        .from("subscription_plan_templates")
        .select("name, price")
        .eq("id", subscriptionRes.data.plan_id)
        .maybeSingle();
      if (planError) throw planError;
      planName = plan?.name ?? subscriptionRes.data.status ?? "Unknown";
      mrrCents = dollarsToCents(toDollars(plan?.price ?? 0));
    }

    const revenueDollars = (invoicesRes.data ?? []).reduce(
      (sum, invoice) => sum + Number(invoice.amount_paid || invoice.total || 0),
      0,
    );
    const revenueCents = dollarsToCents(toDollars(revenueDollars));
    const retentionRate = appointmentCount > 0
      ? Math.round((completedAppointmentCount / appointmentCount) * 100)
      : 0;
    const firstValueAt = firstCompletedRes.data?.actual_end_time ?? firstCompletedRes.data?.updated_at ?? null;
    const firstValueLabel = formatFirstValue(profile.created_at, firstValueAt);
    const lastActiveAt = lastAppointmentRes.data?.updated_at ?? profile.created_at ?? null;
    const featureUsage: Organization360FeatureUsage = {
      appointments: appointmentCount > 0,
      customers: customerCount > 0,
      inventory: inventoryCount > 0,
      reports: invoicesRes.data?.length ? true : false,
      newsletter: Boolean(profile.marketing_email_enabled),
      marketplace: Boolean(profile.marketplace_opt_in),
    };
    const healthScore = calculateHealthScore({
      daysSinceActive: daysBetween(lastActiveAt),
      retentionRate,
      firstValueLabel,
      completedAppointmentCount,
      customerCount,
      vehicleCount,
      revenueCents,
      featureUsage,
    });

    return {
      organizationId: userId,
      organizationName: profile.business_name ?? "Unnamed organization",
      planName,
      mrrCents,
      daysActive: daysBetween(profile.created_at),
      employeeCount: (teamCount.count ?? 0) + 1,
      customerCount,
      vehicleCount,
      appointmentCount,
      completedAppointmentCount,
      revenueCents,
      featureUsage,
      healthScore,
      risk: getRisk(healthScore),
      lastActiveLabel: formatLastActive(lastActiveAt),
      firstValueLabel,
      retentionRate,
    };
  }));
}
