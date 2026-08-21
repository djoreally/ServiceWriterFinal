/**
 * Fleet Contract Command - structured rule-engine contract write operations.
 */
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/security/audit";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface FleetContractRulePayload {
  fleet_client_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  rule_engine: {
    sla_hours: number;
    approval: {
      mode: "auto" | "manual" | "hybrid";
      threshold_amount: number;
      approver_role: "fleet_manager" | "ops_manager" | "finance";
      require_photo_evidence: boolean;
    };
    billing: {
      model: "per_service" | "flat_rate" | "time_and_materials" | "blended";
      invoice_frequency: "per_service" | "weekly" | "biweekly" | "monthly";
      net_terms: "due_on_receipt" | "net_15" | "net_30" | "net_45" | "net_60";
      invoice_group: string;
    };
    po: {
      requires_po: boolean;
      validate_remaining_balance: boolean;
    };
    service_scope: {
      allowed_service_classes: string[];
      restrict_to_profiled_services: boolean;
    };
    scheduling: {
      enforce_location_windows: boolean;
      enforce_sla_window: boolean;
      min_dispatch_buffer_minutes: 0 | 15 | 30 | 45 | 60;
    };
  };
  change_summary?: string;
}

// Backward-compat alias for existing imports.
export type FleetContractPayload = FleetContractRulePayload;

/** Fetch active fleet clients for contract dialog dropdown. */
export async function fetchFleetClientsForContract(userId: string) {
  const { data } = await supabase
    .from("fleet_clients")
    .select("id, company_name")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("company_name");
  return data ?? [];
}

function validateContractRulePayload(payload: FleetContractRulePayload) {
  if (!payload.fleet_client_id || !payload.name) throw new Error("Client and contract name are required.");
  if (!payload.start_date || !payload.end_date) throw new Error("Contract start and end dates are required.");
  if (payload.start_date > payload.end_date) throw new Error("Contract end date must be after start date.");
  if (!payload.rule_engine.sla_hours || payload.rule_engine.sla_hours <= 0) throw new Error("SLA hours must be greater than zero.");
  if (!payload.rule_engine.service_scope.allowed_service_classes.length) throw new Error("At least one service class is required.");
  if (!payload.rule_engine.billing.invoice_group) throw new Error("Billing invoice group is required.");

  if (payload.is_active) {
    if (payload.rule_engine.approval.mode === "hybrid" && payload.rule_engine.approval.threshold_amount <= 0) {
      throw new Error("Hybrid approval mode requires a positive threshold.");
    }
    if (payload.rule_engine.po.requires_po && !payload.rule_engine.po.validate_remaining_balance) {
      throw new Error("PO-required contracts must validate remaining balance.");
    }
  }
}

/** Create a new fleet contract with versioned rule engine metadata. */
export async function createFleetContract(userId: string, payload: FleetContractRulePayload): Promise<string> {
  validateContractRulePayload(payload);

  const versionMeta = {
    engine: "contract_rule_engine_v1",
    revision: 1,
    created_at: new Date().toISOString(),
    created_by: userId,
    change_summary: payload.change_summary || "Initial contract rule set",
  };

  const pricing_rules = {
    ...payload.rule_engine,
    version_meta: versionMeta,
  };

  const { data, error } = await supabase.from("fleet_contracts").insert({
    user_id: userId,
    fleet_client_id: payload.fleet_client_id,
    name: payload.name,
    sla_hours: payload.rule_engine.sla_hours,
    approval_threshold: payload.rule_engine.approval.threshold_amount || null,
    invoice_frequency: payload.rule_engine.billing.invoice_frequency,
    start_date: payload.start_date,
    end_date: payload.end_date,
    notes: JSON.stringify({ version_history: [versionMeta] }),
    is_active: payload.is_active,
    pricing_rules,
  }).select("id").single();

  if (error) throw new Error(error.message);

  await logAudit({
    action: "settings.updated",
    status: "success",
    user_id: userId,
    resource_type: "fleet_contracts",
    resource_id: data.id,
    details: {
      event: "contract_created",
      version_meta: versionMeta,
      approval_mode: payload.rule_engine.approval.mode,
      billing_model: payload.rule_engine.billing.model,
      requires_po: payload.rule_engine.po.requires_po,
      service_scope: payload.rule_engine.service_scope.allowed_service_classes,
    },
  });

  return data.id;
}

/** Update fleet contract with revisioning and audit trail. */
export async function updateFleetContract(contractId: string, payload: FleetContractRulePayload) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  validateContractRulePayload(payload);

  const { data: existing } = await supabase
    .from("fleet_contracts")
    .select("pricing_rules, notes")
    .eq("id", contractId)
    .eq("user_id", user.id)
    .maybeSingle();

  const currentRules = (existing?.pricing_rules as Record<string, unknown> | null) ?? {};
  const currentRevision = Number((currentRules.version_meta as Record<string, unknown> | undefined)?.revision || 0);
  const nextRevision = currentRevision + 1;

  const revisionMeta = {
    engine: "contract_rule_engine_v1",
    revision: nextRevision,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
    change_summary: payload.change_summary || "Contract rules updated",
  };

  const nextRules = {
    ...payload.rule_engine,
    version_meta: revisionMeta,
  };

  let history: Array<Record<string, unknown>> = [];
  try {
    const parsed = existing?.notes ? JSON.parse(existing.notes) : {};
    history = Array.isArray(parsed?.version_history) ? parsed.version_history : [];
  } catch {
    history = [];
  }

  const { error } = await supabase
    .from("fleet_contracts")
    .update({
      fleet_client_id: payload.fleet_client_id,
      name: payload.name,
      sla_hours: payload.rule_engine.sla_hours,
      approval_threshold: payload.rule_engine.approval.threshold_amount || null,
      invoice_frequency: payload.rule_engine.billing.invoice_frequency,
      start_date: payload.start_date,
      end_date: payload.end_date,
      is_active: payload.is_active,
      pricing_rules: nextRules,
      notes: JSON.stringify({ version_history: [...history, revisionMeta] }),
    })
    .eq("id", contractId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  await logAudit({
    action: "settings.updated",
    status: "success",
    user_id: user.id,
    resource_type: "fleet_contracts",
    resource_id: contractId,
    details: {
      event: "contract_updated",
      revision: nextRevision,
      approval_mode: payload.rule_engine.approval.mode,
      billing_model: payload.rule_engine.billing.model,
      requires_po: payload.rule_engine.po.requires_po,
      service_scope: payload.rule_engine.service_scope.allowed_service_classes,
    },
  });
}

/** Delete a fleet contract. */
export async function deleteFleetContract(contractId: string) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  return supabase
    .from("fleet_contracts")
    .delete()
    .eq("id", contractId)
    .eq("user_id", user.id);
}
