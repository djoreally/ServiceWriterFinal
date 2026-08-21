import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type FleetNextAction = {
  kind: "request" | "work_order" | "exception" | "approval" | "delivery" | "invoice";
  entity_id: string;
  category: string;
  score: number;
  title: string;
  subtitle: string | null;
  occurred_at: string;
  route: string;
  metadata: Record<string, unknown>;
};

export type FleetFailureItem = {
  id: string;
  created_at: string;
  status: string;
  attempts?: number;
  error_message?: string;
  last_error?: string;
  source_type?: string;
  event_type?: string;
  invoice_number?: string;
  company_name?: string;
  delivery_last_error?: string;
  delivery_attempt_count?: number;
};

export type FleetFailureWorklists = {
  generated_at: string;
  dead_letters: FleetFailureItem[];
  outbox: FleetFailureItem[];
  invoices: FleetFailureItem[];
};

export async function fetchFleetNextActions(): Promise<{ generatedAt: string; items: FleetNextAction[] }> {
  const { data, error } = await db.rpc("get_fleet_dispatch_next_actions_v1", { p_limit: 150 });
  if (error) throw error;
  return { generatedAt: String(data?.generated_at ?? new Date().toISOString()), items: data?.items ?? [] };
}

export async function fetchFleetFailureWorklists(): Promise<FleetFailureWorklists> {
  const { data, error } = await db.rpc("get_fleet_operations_failures_v1", { p_limit: 150 });
  if (error) throw error;
  return { generated_at: String(data?.generated_at ?? new Date().toISOString()), dead_letters: data?.dead_letters ?? [], outbox: data?.outbox ?? [], invoices: data?.invoices ?? [] };
}

export async function retryFleetOperationalFailure(kind: "dead_letter" | "outbox", id: string): Promise<void> {
  const { error } = await db.rpc("retry_fleet_operational_failure_v1", { p_kind: kind, p_id: id });
  if (error) throw error;
}
