type ApiErrorBody = { error?: { code?: string; message?: string } };

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api").replace(/\/$/, "");

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  const body = await response.json().catch(() => ({})) as ApiErrorBody & T;
  if (!response.ok) {
    throw new ApiClientError(response.status, body.error?.code || "api_error", body.error?.message || "Request failed");
  }
  return body as T;
}

export const nextApi = {
  health: () => request<{ ok: boolean; version: string }>("/v1/health"),
  workspaces: () => request<{ data: unknown[] }>("/v1/workspaces"),
  customers: {
    list: (workspaceId: string, search?: string) => request<{ data: unknown[] }>(`/v1/customers?workspace_id=${encodeURIComponent(workspaceId)}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/customers", { method: "POST", body: JSON.stringify(payload) }),
  },
  vehicles: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/vehicles?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/vehicles", { method: "POST", body: JSON.stringify(payload) }),
  },
  appointments: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/appointments?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/appointments", { method: "POST", body: JSON.stringify(payload) }),
  },
  workOrders: {
    list: (workspaceId: string) => request<{ data: unknown[] }>(`/v1/work-orders?workspace_id=${encodeURIComponent(workspaceId)}`),
    get: (workspaceId: string, id: string) => request<{ data: unknown }>(`/v1/work-orders/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`),
    create: (payload: Record<string, unknown>) => request<{ data: unknown }>("/v1/work-orders", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Record<string, unknown>) => request<{ data: unknown }>(`/v1/work-orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  },
};
