import { supabase } from "@/integrations/supabase/client";

export type TrustContext = {
  userId: string;
  orgId: string;
  role: "owner" | "manager" | "dispatcher" | "technician" | "customer";
  permissions: string[];
  subscriptionTier?: string;
};

const ROLE_PERMISSIONS: Record<TrustContext["role"], string[]> = {
  owner: ["jobs.read", "jobs.write", "jobs.transition", "financials.read"],
  manager: ["jobs.read", "jobs.write", "jobs.transition", "financials.read"],
  dispatcher: ["jobs.read", "jobs.write", "jobs.transition"],
  technician: ["jobs.read", "jobs.transition"],
  customer: ["jobs.read"],
};

function normalizeRole(raw: unknown): TrustContext["role"] {
  const key = String(raw || "").toLowerCase();
  if (key === "owner" || key === "tenant_owner" || key === "provider_owner") return "owner";
  if (key === "manager" || key === "tenant_staff") return "manager";
  if (key === "dispatcher") return "dispatcher";
  if (key === "technician") return "technician";
  return "customer";
}

export async function buildTrustContext(): Promise<TrustContext> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("Not authenticated");

  const role = normalizeRole(user.app_metadata?.role || user.user_metadata?.role);

  let subscriptionTier: string | undefined;
  const { data: sub } = await (supabase as any)
    .from("business_subscriptions")
    .select("status, plan_id, platform_plans(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (sub?.platform_plans?.name) {
    subscriptionTier = String(sub.platform_plans.name);
  } else if (sub?.plan_id) {
    subscriptionTier = String(sub.plan_id);
  }

  return {
    userId: user.id,
    orgId: user.id,
    role,
    permissions: ROLE_PERMISSIONS[role],
    subscriptionTier,
  };
}
