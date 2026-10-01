import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.get<{ data: { generatedAt: string; items: FleetNextAction[] } }>(
    "/v1/fleet/dispatch-actions",
  );
  return {
    generatedAt: String(data?.generatedAt ?? new Date().toISOString()),
    items: data?.items ?? [],
  };
}

export async function fetchFleetFailureWorklists(): Promise<FleetFailureWorklists> {
  const { data } = await apiClient.get<{ data: FleetFailureWorklists }>("/v1/fleet/operations-failures");
  return {
    generated_at: String(data?.generated_at ?? new Date().toISOString()),
    dead_letters: data?.dead_letters ?? [],
    outbox: data?.outbox ?? [],
    invoices: data?.invoices ?? [],
  };
}

export async function retryFleetOperationalFailure(kind: "dead_letter" | "outbox", id: string): Promise<void> {
  await apiClient.post(`/v1/fleet/operations-failures/${id}/retry`, { kind });
}
