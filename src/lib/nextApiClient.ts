import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

type ApiErrorBody = { error?: { code?: string; message?: string } };

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

const workspaceSchema = z.object({
  workspace_id: z.string().uuid(),
  role: z.string().min(1),
  is_active: z.boolean(),
  workspaces: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    kind: z.string().min(1),
    timezone: z.string().min(1),
    currency_code: z.string().min(1),
    is_active: z.boolean(),
  }).nullable(),
});

export type WorkspaceMembership = z.infer<typeof workspaceSchema>;
export type InvitationRecord = {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  invited_email: string;
  invited_role: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type InvitationCreatePayload = {
  workspace_id: string;
  invited_email: string;
  invited_role: "owner" | "admin" | "manager" | "service_advisor" | "technician" | "dispatcher" | "receptionist" | "fleet_manager" | "viewer" | "customer";
  customer_id?: string;
  expires_in_days?: number;
};
export type InvitationDelivery = { status: "accepted" | "failed"; provider?: string; provider_message_id?: string; error?: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const body = await response.json().catch(() => ({})) as ApiErrorBody & T;
  if (!response.ok) {
    throw new ApiClientError(response.status, body.error?.code || "api_error", body.error?.message || "Request failed");
  }
  return body as T;
}

export const nextApi = {
  health: () => request<{ ok: boolean; version: string }>("/v1/health"),
  publicBooking: {
    get: (slug: string, section: "profile" | "catalog" | "packages" | "slots" | "blocked_dates" | "settings" = "profile", date?: string) => {
      const params = new URLSearchParams({ section });
      if (date) params.set("date", date);
      return request<{ data: unknown }>(`/v1/public-booking/${encodeURIComponent(slug)}?${params.toString()}`);
    },
    sendConfirmation: (slug: string, payload: {
      appointment_id: string;
      email: string;
      phone?: string | null;
      transactional_sms_consent: boolean;
      marketing_sms_consent: boolean;
      marketing_email_consent: boolean;
      consent_texts: { transactional_sms: string; marketing_sms: string; marketing_email: string };
    }) =>
      request<{ data: { status: "accepted" | "sent" | "delivered"; provider_message_id: string } }>(
        `/v1/public-booking/${encodeURIComponent(slug)}/confirmation`,
        { method: "POST", body: JSON.stringify(payload) },
      ),
  },
  workspaces: async (): Promise<WorkspaceMembership[]> => {
    const response = await request<{ data: unknown[] }>("/v1/workspaces");
    const parsed = z.array(workspaceSchema).safeParse(response.data);
    if (!parsed.success) throw new ApiClientError(502, "invalid_api_response", "Workspace response was invalid");
    return parsed.data;
  },
  imports: {
    list: (workspaceId: string) => request<{ data: unknown[]; meta: { limit: number; offset: number; total: number } }>(`/v1/imports?workspace_id=${encodeURIComponent(workspaceId)}&limit=50`),
    stage: (workspaceId: string, fileName: string, exportData: unknown) => request<{ data: unknown; preview: unknown }>("/v1/imports", { method: "POST", body: JSON.stringify({ workspace_id: workspaceId, file_name: fileName, export: exportData }) }),
    get: (workspaceId: string, batchId: string) => request<{ data: unknown; records: unknown[] }>(`/v1/imports/${encodeURIComponent(batchId)}?workspace_id=${encodeURIComponent(workspaceId)}`),
    execute: (workspaceId: string, batchId: string, exportData: unknown) => request<{ data: unknown }>(`/v1/imports/${encodeURIComponent(batchId)}`, { method: "POST", body: JSON.stringify({ workspace_id: workspaceId, action: "execute", export: exportData }) }),
    rollback: (workspaceId: string, batchId: string) => request<{ data: unknown }>(`/v1/imports/${encodeURIComponent(batchId)}`, { method: "POST", body: JSON.stringify({ workspace_id: workspaceId, action: "rollback" }) }),
  },
  crm: {
    access: (workspaceId: string) => request<{ data: { workspace_id: string; can_view: boolean } }>(`/v1/crm/access?workspace_id=${encodeURIComponent(workspaceId)}`),
    profiles: {
      list: (workspaceId: string, options: { search?: string; lifecycleStage?: string; limit?: number; offset?: number } = {}) => {
        const params = new URLSearchParams({ workspace_id: workspaceId });
        if (options.search) params.set("search", options.search);
        if (options.lifecycleStage) params.set("lifecycle_stage", options.lifecycleStage);
        if (options.limit) params.set("limit", String(options.limit));
        if (options.offset) params.set("offset", String(options.offset));
        return request<{ data: unknown[]; meta: { limit: number; offset: number; total: number } }>(`/v1/crm/profiles?${params.toString()}`);
      },
      create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/crm/profiles", { method: "POST", body: JSON.stringify(payload) }),
      update: (id: string, workspaceId: string, payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/crm/profiles", { method: "PATCH", body: JSON.stringify({ ...payload, id, workspace_id: workspaceId }) }),
    },
    activities: {
      list: (workspaceId: string, customerId?: string) => {
        const params = new URLSearchParams({ workspace_id: workspaceId });
        if (customerId) params.set("customer_id", customerId);
        return request<{ data: unknown[]; meta: { limit: number; offset: number; total: number } }>(`/v1/crm/activities?${params.toString()}`);
      },
      create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/crm/activities", { method: "POST", body: JSON.stringify(payload) }),
    },
    campaigns: {
      list: (workspaceId: string) => request<{ data: unknown[]; meta: { limit: number; offset: number; total: number } }>(`/v1/crm/campaigns?workspace_id=${encodeURIComponent(workspaceId)}`),
      createDraft: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/crm/campaigns", { method: "POST", body: JSON.stringify(payload) }),
    },
  },
  identity: {
    get: () => request<{ data: { user: { id: string; email: string | null }; memberships: unknown[]; customer_links: unknown[] } }>("/v1/identity"),
  },
  invitations: {
    list: (workspaceId: string) => request<{ data: InvitationRecord[] }>(`/v1/invitations?workspace_id=${encodeURIComponent(workspaceId)}&limit=100`),
    create: (payload: InvitationCreatePayload) => request<{ data: InvitationRecord; delivery: InvitationDelivery; token?: string }>("/v1/invitations", { method: "POST", body: JSON.stringify(payload) }),
    resend: (id: string) => request<{ data: InvitationRecord; delivery: InvitationDelivery; token?: string }>(`/v1/invitations/${encodeURIComponent(id)}/resend`, { method: "POST" }),
    revoke: (id: string) => request<{ data: InvitationRecord }>(`/v1/invitations/${encodeURIComponent(id)}`, { method: "DELETE" }),
    accept: (id: string, token: string) => request<{ data: InvitationRecord }>(`/v1/invitations/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ token }) }),
  },
  customers: {
    list: (workspaceId: string, search?: string) => request<{ data: unknown[] }>(`/v1/customers?workspace_id=${encodeURIComponent(workspaceId)}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/customers", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/customers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/customers/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { method: "DELETE" }),
  },
  vehicles: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/vehicles?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/vehicles", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/vehicles/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/vehicles/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { method: "DELETE" }),
  },
  quotes: {
    convert: (quoteId: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/quotes/${encodeURIComponent(quoteId)}/convert`, { method: "POST", body: JSON.stringify(payload) }),
    updateStatus: (quoteId: string, payload: { workspace_id: string; status: "approved" | "declined"; expected_updated_at?: string | null }) => request<{ data: unknown }>(`/v1/quotes/${encodeURIComponent(quoteId)}/status`, { method: "POST", body: JSON.stringify(payload) }),
  },
  appointments: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/appointments?workspace_id=${encodeURIComponent(workspaceId)}`),
    get: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/appointments/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/appointments", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/appointments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    cancel: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/appointments/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { method: "DELETE" }),
    complete: (id: string, workspaceId: string) => request<{ data: unknown }>(`/v1/appointments/${encodeURIComponent(id)}/complete`, { method: "POST", body: JSON.stringify({ workspace_id: workspaceId }) }),
  },
  invoices: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/invoices?workspace_id=${encodeURIComponent(workspaceId)}`),
    get: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/invoices/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/invoices", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/invoices/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/invoices/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { method: "DELETE" }),
  },
  payments: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/payments?workspace_id=${encodeURIComponent(workspaceId)}`),
    get: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/payments/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/payments", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/payments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/payments/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { method: "DELETE" }),
    action: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/payments/actions", { method: "POST", body: JSON.stringify(payload) }),
  },
  dispatch: {
    assign: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/dispatch/assign", { method: "POST", body: JSON.stringify(payload) }),
  },
  dispatchEvents: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/dispatch-events?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/dispatch-events", { method: "POST", body: JSON.stringify(payload) }),
  },
  serviceRecords: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/service-records?workspace_id=${encodeURIComponent(workspaceId)}`),
    get: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/service-records/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/service-records", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/service-records/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/service-records/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`, { method: "DELETE" }),
  },
  workOrders: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/work-orders?workspace_id=${encodeURIComponent(workspaceId)}`),
    get: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/work-orders/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/work-orders", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/work-orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    advanceChecklist: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/work-orders/checklist/advance", { method: "POST", body: JSON.stringify(payload) }),
    updateChecklistItem: (itemId: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/work-orders/checklist/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  },
};
