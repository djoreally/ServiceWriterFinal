/**
 * In-memory fake of ShopAgentSupabase for channel tests.
 *
 * Supports exactly the query-builder surface the channels use:
 * select/insert/upsert/update + eq/neq/gt/gte/lt/lte/in/contains/order/limit
 * + maybeSingle/single + direct await (thenable).
 */
type Row = Record<string, any>;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fake-id-${idCounter}`;
}

class FakeQuery {
  private rows: Row[];
  private filters: Array<(r: Row) => boolean> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;

  constructor(
    rows: Row[],
    private mode: "select" | "insert" | "upsert" | "update",
    private payload?: any,
    private upsertOpts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.rows = rows;
  }

  select(): this {
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  gt(col: string, val: unknown): this {
    this.filters.push((r) => r[col] > val);
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push((r) => r[col] >= val);
    return this;
  }
  lt(col: string, val: unknown): this {
    this.filters.push((r) => r[col] < val);
    return this;
  }
  lte(col: string, val: unknown): this {
    this.filters.push((r) => r[col] <= val);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  contains(col: string, val: unknown): this {
    this.filters.push((r) => {
      const cur = r[col];
      if (Array.isArray(cur)) {
        const vals = Array.isArray(val) ? val : [val];
        return vals.every((v) => cur.includes(v));
      }
      if (cur && typeof cur === "object" && val && typeof val === "object") {
        return Object.entries(val as Record<string, unknown>).every(([k, v]) => cur[k] === v);
      }
      return false;
    });
    return this;
  }
  order(col: string, options?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: options?.ascending !== false };
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private matched(): Row[] {
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => {
        if (a[col] < b[col]) return asc ? -1 : 1;
        if (a[col] > b[col]) return asc ? 1 : -1;
        return 0;
      });
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return out;
  }

  private execute(): { data: any; error: any } {
    switch (this.mode) {
      case "select":
        return { data: this.matched(), error: null };
      case "insert": {
        const row = { id: nextId(), created_at: new Date().toISOString(), ...this.payload };
        this.rows.push(row);
        return { data: [row], error: null };
      }
      case "upsert": {
        const conflictCols = (this.upsertOpts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const existing = conflictCols.length
          ? this.rows.find((r) => conflictCols.every((c) => r[c] === this.payload[c]))
          : undefined;
        if (existing) {
          if (this.upsertOpts?.ignoreDuplicates) return { data: [], error: null };
          Object.assign(existing, this.payload);
          return { data: [existing], error: null };
        }
        const row = { id: nextId(), created_at: new Date().toISOString(), ...this.payload };
        this.rows.push(row);
        return { data: [row], error: null };
      }
      case "update": {
        const matched = this.matched();
        for (const r of matched) Object.assign(r, this.payload);
        return { data: matched, error: null };
      }
    }
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    const { data, error } = this.execute();
    if (error) return { data: null, error };
    const rows = Array.isArray(data) ? data : [data];
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<{ data: any; error: any }> {
    const { data, error } = await this.maybeSingle();
    if (error || !data) return { data: null, error: error ?? new Error("No rows") };
    return { data, error: null };
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]>;
  rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];

  constructor(seed: Record<string, Row[]> = {}) {
    this.tables = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, [...v]]));
  }

  from(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    const rows = this.tables[table];
    return {
      select: () => new FakeQuery(rows, "select"),
      insert: (row: any) => new FakeQuery(rows, "insert", row),
      upsert: (row: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
        new FakeQuery(rows, "upsert", row, opts),
      update: (row: any) => new FakeQuery(rows, "update", row),
    };
  }

  async rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> {
    this.rpcCalls.push({ fn, args });
    return { data: null, error: null };
  }

  /** Test seeding helper: append a row, creating the table array if needed. */
  pushRow(table: string, row: Row): void {
    if (!this.tables[table]) this.tables[table] = [];
    this.tables[table].push(row);
  }

  rowsOf(table: string): Row[] {
    return this.tables[table] ?? [];
  }
}
