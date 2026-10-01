/**
 * Contract tests for the single sanctioned HTTP path (`src/lib/api-client.ts`).
 */
import { ApiClientError, apiClient, apiRequest } from "../api-client";

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-access-token" } },
      })),
    },
  },
}));

const originalFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllMocks();
});

describe("api-client", () => {
  it("attaches the Supabase session token as a Bearer header", async () => {
    const fetchMock = jest.fn(() => jsonResponse(200, { ok: true }));
    globalThis.fetch = fetchMock;

    await apiClient.get<{ ok: boolean }>("/v1/health");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/health");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-access-token");
    expect(headers.get("Accept")).toBe("application/json");
    expect(init.credentials).toBe("include");
  });

  it("lets an explicit Authorization header win over the session token", async () => {
    const fetchMock = jest.fn(() => jsonResponse(200, {}));
    globalThis.fetch = fetchMock;

    await apiClient.get("/v1/health", { headers: { Authorization: "Bearer explicit" } });

    const headers = new Headers((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers);
    expect(headers.get("Authorization")).toBe("Bearer explicit");
  });

  it("serializes query params and skips null/undefined values", async () => {
    const fetchMock = jest.fn(() => jsonResponse(200, {}));
    globalThis.fetch = fetchMock;

    await apiClient.get("/v1/things", {
      query: { search: "a b", limit: 25, flag: true, missing: undefined, gone: null },
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/things?search=a+b&limit=25&flag=true");
  });

  it("JSON-encodes plain-object bodies on write verbs", async () => {
    const fetchMock = jest.fn(() => jsonResponse(200, { success: true }));
    globalThis.fetch = fetchMock;

    await apiClient.post<{ success: boolean }>("/v1/things", { name: "x" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "x" }));
  });

  it("parses non-2xx responses into ApiClientError from the {error:{code,message}} envelope", async () => {
    const fetchMock = jest.fn(() =>
      jsonResponse(403, { error: { code: "forbidden", message: "Nope" } }),
    );
    globalThis.fetch = fetchMock;

    const error = await apiClient.get("/v1/things").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiClientError);
    const typed = error as ApiClientError;
    expect(typed.status).toBe(403);
    expect(typed.code).toBe("forbidden");
    expect(typed.message).toBe("Nope");
  });

  it("falls back to generic code/message when the error body is unstructured", async () => {
    const fetchMock = jest.fn(() => jsonResponse(500, { nope: true }));
    globalThis.fetch = fetchMock;

    const error = await apiClient.delete("/v1/things").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe("api_error");
    expect((error as ApiClientError).message).toBe("Request failed");
  });

  it("resolves undefined for 204 No Content", async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({ ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response),
    );
    globalThis.fetch = fetchMock;

    await expect(apiClient.delete("/v1/things/1")).resolves.toBeUndefined();
  });

  it("exposes the low-level apiRequest for full RequestInit control", async () => {
    const fetchMock = jest.fn(() => jsonResponse(200, { custom: true }));
    globalThis.fetch = fetchMock;

    const result = await apiRequest<{ custom: boolean }>("/v1/things", { method: "OPTIONS" });
    expect(result).toEqual({ custom: true });
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("OPTIONS");
  });
});
