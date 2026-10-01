// Shared helpers for Next.js API route grey-box tests (src/server/__tests__/api-routes).
// Every test file in this directory must `import "./_env";` FIRST, then this
// module (or the route modules under test).

export const WS_ID = "11111111-1111-4111-8111-111111111111";
export const USER_ID = "22222222-2222-4222-8222-222222222222";
export const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";

export const TEST_USER = { id: USER_ID, email: "tech@example.com" };

export interface DbResult {
  data?: unknown;
  error?: unknown;
}

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "containedBy",
  "range",
  "order",
  "limit",
  "offset",
  "csv",
];

// Chainable Supabase query-builder stub. Terminal calls (.single() /
// .maybeSingle()) resolve the configured result; awaiting any other chain
// also resolves it via the thenable.
export function makeQueryBuilder(result: DbResult = { data: null, error: null }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const builder: Record<string, unknown> = {};
  for (const method of CHAIN_METHODS) {
    builder[method] = jest.fn((..._args: unknown[]) => builder);
  }
  builder.single = jest.fn(() => Promise.resolve(resolved));
  builder.maybeSingle = jest.fn(() => Promise.resolve(resolved));
  builder.then = (resolve: (value: DbResult) => void) => {
    resolve(resolved);
  };
  return builder as unknown as {
    [K in (typeof CHAIN_METHODS)[number]]: jest.Mock;
  } & {
    single: jest.Mock;
    maybeSingle: jest.Mock;
  };
}

export function makeSupabaseClient(
  tables: Record<string, DbResult> = {},
  defaultResult: DbResult = { data: [], error: null },
) {
  const from = jest.fn((table: string) =>
    makeQueryBuilder(Object.prototype.hasOwnProperty.call(tables, table) ? tables[table] : defaultResult),
  );
  const rpc = jest.fn((_fn: string, _args?: unknown) => Promise.resolve({ data: null, error: null }));
  const auth = { getUser: jest.fn(() => Promise.resolve({ data: { user: TEST_USER }, error: null })) };
  return { from, rpc, auth };
}

export type MockSupabaseClient = ReturnType<typeof makeSupabaseClient>;

// Build a Request for a route handler. Paths are treated as relative to a
// fake origin so `new URL(request.url)` works inside handlers.
export function makeRequest(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Request {
  const url = path.startsWith("http") ? path : `https://test.local${path}`;
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  let body: string | undefined;
  if (init.body !== undefined) {
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    if (!headers["content-type"] && !headers["Content-Type"]) headers["content-type"] = "application/json";
  }
  return new Request(url, { method: init.method ?? "GET", headers, body });
}

export function contextWithParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

export async function readJson(res: Response): Promise<{ status: number; body: any }> {
  const body = await (res as unknown as { json: () => Promise<unknown> }).json().catch(() => null);
  return { status: (res as unknown as { status: number }).status, body };
}

// Stubs the @/server/api auth guards. The test file must first declare:
//   jest.mock("@/server/api", () => ({
//     ...jest.requireActual("@/server/api"),
//     requireWorkspaceMember: jest.fn(),
//     requireUser: jest.fn(),
//     requireCrmCapability: jest.fn(),
//     requireWorkspacePaymentsAddon: jest.fn(),
//   }));
export function stubWorkspaceMember(api: { requireWorkspaceMember: unknown }, supabase: MockSupabaseClient, user = TEST_USER) {
  (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({ supabase, user });
}

export function stubWorkspaceMemberReject(api: { requireWorkspaceMember: unknown }, status = 401, code = "unauthenticated") {
  const { ApiError } = jest.requireActual("@/server/api") as typeof import("@/server/api");
  (api.requireWorkspaceMember as jest.Mock).mockRejectedValue(new ApiError(status, "Access denied", code));
}

export function stubRequireUser(api: { requireUser: unknown }, supabase?: MockSupabaseClient, user = TEST_USER) {
  (api.requireUser as jest.Mock).mockResolvedValue({ supabase: supabase ?? makeSupabaseClient(), user });
}

export function stubRequireUserReject(api: { requireUser: unknown }) {
  const { ApiError } = jest.requireActual("@/server/api") as typeof import("@/server/api");
  (api.requireUser as jest.Mock).mockRejectedValue(new ApiError(401, "Authentication required", "unauthenticated"));
}
