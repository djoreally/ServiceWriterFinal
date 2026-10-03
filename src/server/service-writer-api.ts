import "server-only";

import { ApiError } from "@/server/api";

const API_URL = process.env.SERVICE_WRITER_API_URL?.replace(/\/$/, "");

function requiredApiUrl() {
  if (!API_URL) throw new ApiError(503, "SERVICE_WRITER_API_URL is not configured", "service_writer_api_unconfigured");
  return API_URL;
}

export async function serviceWriterApi<T>(request: Request, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  const requestId = request.headers.get("x-request-id");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);
  if (requestId) headers.set("x-request-id", requestId);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(`${requiredApiUrl()}${path}`, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok || payload?.ok === false) {
    throw new ApiError(response.status, payload?.error?.message ?? `Service Writer API request failed (${response.status})`, payload?.error?.code ?? "service_writer_api_error");
  }
  return (payload && "data" in payload ? payload.data : payload) as T;
}

export function ensureIdempotencyKey(request: Request) {
  return request.headers.get("idempotency-key") ?? crypto.randomUUID();
}
