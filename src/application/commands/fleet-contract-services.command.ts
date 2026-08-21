/**
 * Fleet Contract Services Command — write operations for attaching/managing
 * platform services on fleet contracts.
 *
 * All mutations run through validateContractServiceInput() so that invalid
 * pricing tiers (non-numeric prices, negative prices, negative durations,
 * blank labels) are rejected with a clear message before the request hits
 * the database. Postgres CHECK constraints and the
 * enforce_active_contract_has_services() trigger enforce the same rules
 * server-side as a defence in depth.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AttachServicePayload {
  fleet_contract_id: string;
  service_catalog_id: string;
  custom_price?: number | null;
  custom_label?: string | null;
  pricing_model?: string;
  notes?: string | null;
  billing_frequency?: string | null;
  estimated_duration?: number | null;
}

export interface ContractServiceValidationInput {
  service_catalog_id?: string | null;
  custom_price?: number | string | null;
  custom_label?: string | null;
  estimated_duration?: number | string | null;
}

/**
 * Validate a contract service tier. Throws a `ContractServiceValidationError`
 * with a human-readable message pointing at the failing field.
 */
export class ContractServiceValidationError extends Error {
  field: "service_catalog_id" | "custom_price" | "custom_label" | "estimated_duration";
  constructor(field: ContractServiceValidationError["field"], message: string) {
    super(message);
    this.name = "ContractServiceValidationError";
    this.field = field;
  }
}

export function validateContractServiceInput(input: ContractServiceValidationInput): void {
  if (!input.service_catalog_id || String(input.service_catalog_id).trim() === "") {
    throw new ContractServiceValidationError(
      "service_catalog_id",
      "A platform service must be selected for every contract pricing tier.",
    );
  }

  if (input.custom_price != null && input.custom_price !== "") {
    const priceNum = typeof input.custom_price === "string"
      ? Number(input.custom_price)
      : input.custom_price;
    if (!Number.isFinite(priceNum)) {
      throw new ContractServiceValidationError(
        "custom_price",
        "Contract price must be a number.",
      );
    }
    if (priceNum < 0) {
      throw new ContractServiceValidationError(
        "custom_price",
        "Contract price cannot be negative.",
      );
    }
  }

  if (input.custom_label != null && String(input.custom_label).length > 0
    && String(input.custom_label).trim().length === 0) {
    throw new ContractServiceValidationError(
      "custom_label",
      "Custom label cannot be blank whitespace.",
    );
  }

  if (input.estimated_duration != null && input.estimated_duration !== "") {
    const durNum = typeof input.estimated_duration === "string"
      ? Number(input.estimated_duration)
      : input.estimated_duration;
    if (!Number.isFinite(durNum)) {
      throw new ContractServiceValidationError(
        "estimated_duration",
        "Estimated duration must be a number of minutes.",
      );
    }
    if (durNum < 0) {
      throw new ContractServiceValidationError(
        "estimated_duration",
        "Estimated duration cannot be negative.",
      );
    }
  }
}

function translateSupabaseError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error("This service is already attached to the contract.");
  }
  if (error.code === "23514") {
    // CHECK constraint violation (custom_price / custom_label).
    if (/custom_price/i.test(error.message)) {
      return new Error("Contract price cannot be negative.");
    }
    if (/custom_label/i.test(error.message)) {
      return new Error("Custom label cannot be blank whitespace.");
    }
    return new Error(error.message);
  }
  return new Error(error.message);
}

/** Attach a platform service to a fleet contract. */
export async function attachServiceToContract(
  userId: string,
  payload: AttachServicePayload,
): Promise<void> {
  validateContractServiceInput({
    service_catalog_id: payload.service_catalog_id,
    custom_price: payload.custom_price,
    custom_label: payload.custom_label,
    estimated_duration: payload.estimated_duration,
  });

  const { error } = await supabase.from("fleet_contract_services").insert({
    user_id: userId,
    fleet_contract_id: payload.fleet_contract_id,
    service_catalog_id: payload.service_catalog_id,
    custom_price: payload.custom_price ?? null,
    custom_label: payload.custom_label ?? null,
    pricing_model: payload.pricing_model || "fixed",
    notes: payload.notes ?? null,
    billing_frequency: payload.billing_frequency ?? null,
  });

  if (error) throw translateSupabaseError(error);
}

/** Update a fleet contract service override. */
export async function updateContractService(
  id: string,
  updates: Partial<{
    custom_price: number | null;
    custom_label: string | null;
    pricing_model: string;
    is_active: boolean;
    notes: string | null;
    billing_frequency: string | null;
  }>,
): Promise<void> {
  if ("custom_price" in updates || "custom_label" in updates) {
    validateContractServiceInput({
      service_catalog_id: "__update__",
      custom_price: updates.custom_price,
      custom_label: updates.custom_label,
    });
  }

  const { error } = await supabase
    .from("fleet_contract_services")
    .update(updates)
    .eq("id", id);
  if (error) throw translateSupabaseError(error);
}

/** Remove a service from a fleet contract. */
export async function removeServiceFromContract(id: string): Promise<void> {
  const { error } = await supabase
    .from("fleet_contract_services")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Bulk attach multiple services to a contract at once. */
export async function bulkAttachServicesToContract(
  userId: string,
  contractId: string,
  services: Array<{
    service_catalog_id: string;
    custom_price?: number | null;
    custom_label?: string | null;
    estimated_duration?: number | null;
  }>,
): Promise<void> {
  if (!services.length) return;

  services.forEach((s, idx) => {
    try {
      validateContractServiceInput(s);
    } catch (err) {
      if (err instanceof ContractServiceValidationError) {
        throw new Error(`Row ${idx + 1}: ${err.message}`);
      }
      throw err;
    }
  });

  const rows = services.map((s, idx) => ({
    user_id: userId,
    fleet_contract_id: contractId,
    service_catalog_id: s.service_catalog_id,
    custom_price: s.custom_price ?? null,
    custom_label: s.custom_label ?? null,
    pricing_model: "fixed",
    sort_order: idx,
  }));

  const { error } = await supabase
    .from("fleet_contract_services")
    .upsert(rows, { onConflict: "fleet_contract_id,service_catalog_id" });

  if (error) throw translateSupabaseError(error);
}
