/**
 * Minimal structural Supabase surface used by the Shop Agent channels.
 *
 * The real admin client is cast to this interface at the call sites
 * (`supabase as unknown as ShopAgentSupabase`) — the same convention as
 * `MessagingSupabase` in src/server/hono/routes/messaging.ts. Tests inject
 * an in-memory fake implementing this interface.
 */

/** eslint-disable @typescript-eslint/no-explicit-any */
export interface ShopAgentQueryChain {
  select: (columns?: string) => ShopAgentQueryChain;
  eq: (column: string, value: unknown) => ShopAgentQueryChain;
  neq: (column: string, value: unknown) => ShopAgentQueryChain;
  gt: (column: string, value: unknown) => ShopAgentQueryChain;
  gte: (column: string, value: unknown) => ShopAgentQueryChain;
  lt: (column: string, value: unknown) => ShopAgentQueryChain;
  lte: (column: string, value: unknown) => ShopAgentQueryChain;
  in: (column: string, values: unknown[]) => ShopAgentQueryChain;
  contains: (column: string, value: unknown) => ShopAgentQueryChain;
  order: (column: string, options?: { ascending?: boolean }) => ShopAgentQueryChain;
  limit: (count: number) => ShopAgentQueryChain;
  maybeSingle: () => Promise<{ data: any; error: any }>;
  single: () => Promise<{ data: any; error: any }>;
  /**
   * Query chains are awaitable like supabase-js builders:
   * `await` resolves to { data, error }.
   */
  then: <TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
}

export interface ShopAgentTableClient {
  select: (columns?: string) => ShopAgentQueryChain;
  insert: (row: Record<string, unknown>) => ShopAgentQueryChain;
  upsert: (
    row: Record<string, unknown>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) => ShopAgentQueryChain;
  update: (row: Record<string, unknown>) => ShopAgentQueryChain;
}

export interface ShopAgentSupabase {
  from: (table: string) => ShopAgentTableClient;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
}
