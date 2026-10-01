/**
 * Shared grey-box test harness state for the Hono API layer.
 *
 * - `authState` drives the mocked `@/server/api` auth functions
 *   (ok / unauthorized / forbidden / payments_required).
 * - `db` maps Supabase table names to canned `{ data, error }` results.
 *   Use the `:single` suffix to target `.single()` / `.maybeSingle()`
 *   terminals independently of the awaited (thenable) builder, e.g.
 *   `db["appointments"]` vs `db["appointments:single"]`.
 *   RPC results live under `rpc:<fn>`; edge-function results under `fn:<name>`.
 * - `calls` captures inserts / updates / upserts / rpc calls for assertions.
 * - `mockSupabase` is a chainable, thenable query-builder mock that mimics
 *   the postgrest-js surface the routers use (from/select/eq/order/range/
 *   single/maybeSingle/insert/update/upsert/delete/rpc/functions/storage/auth).
 */
export const WS_ID = "550e8400-e29b-41d4-a716-446655440001";
export const WS_ID_2 = "550e8400-e29b-41d4-a716-446655440099";
export const USER_ID = "660e8400-e29b-41d4-a716-446655440001";
export const CUSTOMER_ID = "770e8400-e29b-41d4-a716-446655440001";

export type AuthMode =
  | "ok"
  | "unauthorized"
  | "forbidden"
  | "payments_required";

export const authState: { mode: AuthMode; role: string } = {
  mode: "ok",
  role: "owner",
};

export interface DbResult {
  data: unknown;
  error: unknown;
}

export const db: Record<string, DbResult> = {};

export const calls: {
  inserts: Array<{ table: string; rows: unknown }>;
  updates: Array<{ table: string; patch: unknown }>;
  upserts: Array<{ table: string; rows: unknown; options?: unknown }>;
  rpc: Array<{ fn: string; params: unknown }>;
} = { inserts: [], updates: [], upserts: [], rpc: [] };

export function resetHarness(): void {
  authState.mode = "ok";
  authState.role = "owner";
  for (const key of Object.keys(db)) delete db[key];
  calls.inserts.length = 0;
  calls.updates.length = 0;
  calls.upserts.length = 0;
  calls.rpc.length = 0;
}

function resultFor(table: string, terminal?: "single"): DbResult {
  const key = terminal ? `${table}:${terminal}` : table;
  return db[key] ?? db[table] ?? { data: null, error: null };
}

function makeBuilder(table: string): unknown {
  const builder = new Proxy(function () {}, {
    get(_target, prop: string | symbol) {
      if (prop === "then") {
        // Thenable: `await builder` resolves the table's canned result.
        return (resolve: (value: DbResult) => void) => resolve(resultFor(table));
      }
      if (prop === "single" || prop === "maybeSingle") {
        return async () => resultFor(table, "single");
      }
      if (prop === "insert") {
        return (rows: unknown) => {
          calls.inserts.push({ table, rows });
          return makeBuilder(table);
        };
      }
      if (prop === "update") {
        return (patch: unknown) => {
          calls.updates.push({ table, patch });
          return makeBuilder(table);
        };
      }
      if (prop === "upsert") {
        return (rows: unknown, options?: unknown) => {
          calls.upserts.push({ table, rows, options });
          return makeBuilder(table);
        };
      }
      if (typeof prop === "string") {
        // select/eq/neq/in/order/limit/range/gte/lte/gt/lt/like/ilike/is/not/or/delete/...
        return (..._args: unknown[]) => makeBuilder(table);
      }
      return undefined;
    },
    apply() {
      return makeBuilder(table);
    },
  });
  return builder;
}

export const mockSupabase: Record<string, unknown> = {
  from: (table: string) => makeBuilder(table),
  rpc: async (fn: string, params?: unknown) => {
    calls.rpc.push({ fn, params });
    return db[`rpc:${fn}`] ?? { data: null, error: null };
  },
  functions: {
    invoke: async (fn: string, _opts?: unknown) =>
      db[`fn:${fn}`] ?? { data: null, error: null },
  },
  storage: {
    listBuckets: async () => ({ data: [], error: null }),
    from: (_bucket: string) => ({
      upload: async (path: string, _body: unknown, _opts?: unknown) => ({
        data: { path },
        error: null,
      }),
      createSignedUrl: async (path: string, _expiresIn: number) => ({
        data: { signedUrl: `https://signed.example/${path}` },
        error: null,
      }),
      remove: async (_paths: string[]) => ({ data: [], error: null }),
      download: async (_path: string) => ({ data: new Blob(["x"]), error: null }),
      list: async () => ({ data: [], error: null }),
    }),
  },
  auth: {
    getUser: async () => ({
      data: { user: { id: USER_ID, email: "tech@example.com" } },
      error: null,
    }),
    getSession: async () => ({ data: { session: null }, error: null }),
    admin: {
      getUserById: async () => ({
        data: { user: { id: USER_ID, email: "tech@example.com" } },
        error: null,
      }),
    },
  },
};
