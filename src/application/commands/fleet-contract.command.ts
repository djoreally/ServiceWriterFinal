/**
 * Fleet Contract Command - structured rule-engine contract write operations.
 */
import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.get<{ data: { id: string; company_name: string }[] }>(
    "/v1/fleet/clients/options",
  );
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

  const { data } = await apiClient.post<{ data: { id: string } }>("/v1/fleet/contracts", { payload });
  return data.id;
}

/** Update fleet contract with revisioning and audit trail. */
export async function updateFleetContract(contractId: string, payload: FleetContractRulePayload) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  validateContractRulePayload(payload);

  await apiClient.patch(`/v1/fleet/contracts/${contractId}`, { payload });
}

/** Delete a fleet contract. */
export async function deleteFleetContract(contractId: string) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  try {
    const { data } = await apiClient.delete<{ data: unknown }>(`/v1/fleet/contracts/${contractId}`);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
