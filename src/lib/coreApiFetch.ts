import { supabase } from "@/integrations/supabase/client";

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");

export async function coreApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init.headers || {}),
    },
  });

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null &&
      "error" in payload && typeof payload.error === "object" && payload.error !== null &&
      "message" in payload.error && typeof payload.error.message === "string"
        ? payload.error.message
        : `API request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}
