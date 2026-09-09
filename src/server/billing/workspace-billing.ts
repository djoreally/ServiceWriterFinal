import Stripe from "stripe";
import { ApiError, requireUser } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type { CanonicalBasePlan } from "@/domain/billing/canonical-pricing";

export type BillingInterval = "monthly" | "annual";

export type WorkspaceBillingRecord = {
  workspace_id: string;
  plan_tier: CanonicalBasePlan;
  billing_interval: BillingInterval;
  payments_addon_active: boolean;
  additional_technician_quantity: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type BillingWorkspace = { id: string; name: string; created_by: string };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function stripeBillingClient() {
  return new Stripe(required("STRIPE_SECRET_KEY"));
}

export async function resolveAuthorizedBillingWorkspace(request: Request, explicitWorkspaceId?: string | null) {
  const { user } = await requireUser(request);
  const admin = createSupabaseAdminClient();

  const owned = await admin
    .from("workspaces")
    .select("id,name,created_by")
    .eq("created_by", user.id)
    .eq("is_active", true);
  if (owned.error) throw owned.error;

  const memberships = await admin
    .from("workspace_members")
    .select("workspace_id,role,is_active,workspaces!inner(id,name,created_by,is_active)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"]);
  if (memberships.error) throw memberships.error;

  const candidates = new Map<string, BillingWorkspace>();
  for (const workspace of owned.data ?? []) {
    candidates.set(workspace.id, workspace as BillingWorkspace);
  }
  for (const row of memberships.data ?? []) {
    const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
    if (workspace && workspace.is_active !== false) {
      candidates.set(workspace.id, {
        id: workspace.id,
        name: workspace.name,
        created_by: workspace.created_by,
      });
    }
  }

  if (explicitWorkspaceId) {
    const workspace = candidates.get(explicitWorkspaceId);
    if (!workspace) throw new ApiError(403, "Owner or admin access is required for workspace billing", "billing_forbidden");
    return { admin, user, workspace };
  }

  if (candidates.size === 0) throw new ApiError(403, "No billable workspace is available for this account", "billing_workspace_missing");
  if (candidates.size > 1) throw new ApiError(409, "Choose which workspace you want to manage", "billing_workspace_required");
  return { admin, user, workspace: [...candidates.values()][0] };
}

export async function ensureWorkspaceBilling(admin: ReturnType<typeof createSupabaseAdminClient>, workspaceId: string) {
  const existing = await admin.from("workspace_billing").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as WorkspaceBillingRecord;

  const inserted = await admin
    .from("workspace_billing")
    .insert({ workspace_id: workspaceId, plan_tier: "basic", billing_interval: "monthly", payments_addon_active: false, additional_technician_quantity: 0, subscription_status: "active" })
    .select("*")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data as WorkspaceBillingRecord;
}

export async function getCatalogPrice(admin: ReturnType<typeof createSupabaseAdminClient>, catalogKey: string) {
  const result = await admin
    .from("billing_price_catalog")
    .select("catalog_key,component,plan_tier,billing_interval,unit_amount_cents,stripe_product_id,stripe_price_id,active")
    .eq("catalog_key", catalogKey)
    .eq("active", true)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export function checkoutCatalogKeys(input: {
  planTier: CanonicalBasePlan;
  interval: BillingInterval;
  paymentsAddonActive: boolean;
  additionalTechnicianQuantity: number;
}) {
  if (input.planTier === "basic" && input.additionalTechnicianQuantity !== 0) {
    throw new ApiError(400, "Basic does not include technician seats", "invalid_technician_quantity");
  }

  const keys: Array<{ key: string; quantity: number }> = [];
  if (input.planTier !== "basic") keys.push({ key: `${input.planTier}_${input.interval}`, quantity: 1 });
  if (input.additionalTechnicianQuantity > 0) keys.push({ key: `${input.planTier}_technician_${input.interval}`, quantity: input.additionalTechnicianQuantity });
  if (input.paymentsAddonActive) keys.push({ key: `payments_${input.interval}`, quantity: 1 });
  return keys;
}
