/**
 * Unit tests for the shared appointment money composition
 * (`@/server/appointments/appointment-money`) — the ONE server read of an
 * appointment's money state (P3 payment-state fix).
 *
 * The fixture is Cristina Love's INV-106 shape, the defect case: the
 * invoice is PAID in full, but its two payment rows bind differently —
 * the real charge binds only through `payments.invoice_id` (manual
 * closeout, no `appointment_id` in metadata), while the provider-sync
 * working row carries the metadata key. The old payments route keyed
 * exclusively on the metadata shortcut and saw only the pending working
 * row; the canonical read resolves BOTH and takes its summary from the
 * invoice facts.
 *
 * The fake Supabase client below HONORS the filter chain (eq / in /
 * contains / filter / order) over in-memory rows, so these tests prove
 * resolution semantics, not canned responses.
 */
import { describe, it, expect, jest } from "@jest/globals";
import {
  composeAppointmentJobMoney,
  composeAppointmentPaymentState,
  linkAppointmentInvoices,
  resolveAppointmentPaymentRows,
} from "@/server/appointments/appointment-money";

type Row = Record<string, any>;

const WS_ID = "550e8400-e29b-41d4-a716-446655440001";
const APPT_ID = "94ead8b9-afc8-4061-85dc-469fb777f25f";
const OTHER_APPT_ID = "aa0e8400-e29b-41d4-a716-4466554400aa";
const INV_ID = "bb0e8400-e29b-41d4-a716-4466554400bb";
const OTHER_INV_ID = "bb0e8400-e29b-41d4-a716-4466554400cc";
const MANUAL_PAY_ID = "cc0e8400-e29b-41d4-a716-4466554400cc";
const SYNC_PAY_ID = "dd0e8400-e29b-41d4-a716-4466554400dd";
const OTHER_PAY_ID = "ee0e8400-e29b-41d4-a716-4466554400ee";

// ---------------------------------------------------------------------------
// Filter-honoring fake Supabase query builder
// ---------------------------------------------------------------------------

function getPath(row: Row, expr: string): unknown {
  const [head, tail] = expr.split("->>");
  if (tail) {
    const obj = row[head];
    return obj && typeof obj === "object" ? (obj as Row)[tail] : undefined;
  }
  return row[expr];
}

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private sortSpec: { col: string; ascending: boolean } | null = null;
  private limitVal: number | null = null;

  constructor(private rows: Row[]) {}

  select() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  contains(col: string, obj: Record<string, unknown>) {
    this.filters.push((r) => {
      const target = r[col];
      if (!target || typeof target !== "object") return false;
      return Object.entries(obj).every(([k, v]) => (target as Row)[k] === v);
    });
    return this;
  }
  filter(expr: string, op: string, val: unknown) {
    if (op === "in") {
      const list = String(val)
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      this.filters.push((r) => list.includes(String(getPath(r, expr))));
    } else if (op === "eq") {
      this.filters.push((r) => String(getPath(r, expr)) === String(val));
    }
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.sortSpec = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitVal = n;
    return this;
  }
  range() {
    return this;
  }
  private exec(): Row[] {
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.sortSpec) {
      const { col, ascending } = this.sortSpec;
      out = [...out].sort((a, b) => {
        const cmp = String(a[col] ?? "").localeCompare(String(b[col] ?? ""));
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitVal != null) out = out.slice(0, this.limitVal);
    return out;
  }
  async maybeSingle() {
    const rows = this.exec();
    return { data: rows[0] ?? null, error: null };
  }
  async single() {
    const rows = this.exec();
    return { data: rows[0] ?? null, error: null };
  }
  then(onFulfilled: unknown, onRejected: unknown) {
    return Promise.resolve({ data: this.exec(), error: null }).then(
      onFulfilled as never,
      onRejected as never,
    );
  }
}

function fakeDb(tables: Record<string, Row[]>) {
  return { from: (table: string) => new FakeQuery(tables[table] ?? []) } as any;
}

// ---------------------------------------------------------------------------
// Production-shape fake: on the invoices table, ONLY `.eq` is honored.
// `.filter(...)` (the old linker's `metadata->>appointment_id in (...)`
// leg), `.in`, and `.contains` match nothing and error nothing — exactly
// what the real PostgREST stack did to the old linker in production,
// where list/cockpit cards rendered paid jobs as "Due" while the
// appointment tab (which resolves through `.contains` on payments)
// showed the invoice facts correctly.
// ---------------------------------------------------------------------------

class EqOnlyInvoicesQuery extends FakeQuery {
  private forceEmpty(): this {
    super.eq("__eq_only_no_match__", "__never__");
    return this;
  }
  filter() {
    return this.forceEmpty();
  }
  contains() {
    return this.forceEmpty();
  }
  in() {
    return this.forceEmpty();
  }
}

function fakeProdDb(tables: Record<string, Row[]>) {
  return {
    from: (table: string) =>
      table === "invoices"
        ? new EqOnlyInvoicesQuery(tables[table] ?? [])
        : new FakeQuery(tables[table] ?? []),
  } as any;
}

// ---------------------------------------------------------------------------
// Cristina / INV-106 fixture
// ---------------------------------------------------------------------------

const cristinaAppointment: Row = {
  id: APPT_ID,
  workspace_id: WS_ID,
  source: "moms_website",
  status: "completed",
  metadata: {
    pricing_state: "website_quote_locked",
    estimated_cost: 133.83,
    client_estimated_cost: 133.83,
  },
};

const inv106: Row = {
  id: INV_ID,
  workspace_id: WS_ID,
  invoice_number: 106,
  total: 133.83,
  amount_paid: 133.83,
  status: "paid",
  created_at: "2026-11-05T16:00:00Z",
  metadata: { appointment_id: APPT_ID },
};

const manualCloseoutRow: Row = {
  id: MANUAL_PAY_ID,
  workspace_id: WS_ID,
  invoice_id: INV_ID,
  amount: 133.83,
  status: "succeeded",
  provider: "stripe",
  provider_payment_id: "ch_3UYY1nADolYVlmkJ1cRz3W1H",
  created_at: "2026-11-05T21:17:00Z",
  updated_at: "2026-11-05T21:17:00Z",
  metadata: {
    source: "manual_closeout",
    note: "Paid via Stripe payment link (manual reconcile)",
  },
};

const providerSyncRow: Row = {
  id: SYNC_PAY_ID,
  workspace_id: WS_ID,
  invoice_id: INV_ID,
  amount: 133.83,
  status: "pending",
  provider: null,
  provider_payment_id: null,
  created_at: "2026-11-05T21:38:16Z",
  updated_at: "2026-11-05T23:30:13Z",
  metadata: {
    source: "provider_sync",
    appointment_id: APPT_ID,
    payment_type: "pay_at_service",
    stripe_sync_status: "synced",
    stripe_invoice_id: "in_1UYa6fAeZsMzvbynylVUnkbl",
    stripe_customer_id: "cus_VZjZXiZ1QXxIiK",
    payment_url: "https://invoice.stripe.com/i/acct_1Sfpd/test",
    subtotal_cents: 13383,
    tax_amount_cents: 0,
  },
};

const otherAppointmentRow: Row = {
  id: OTHER_PAY_ID,
  workspace_id: WS_ID,
  invoice_id: OTHER_INV_ID,
  amount: 50,
  status: "succeeded",
  provider: "stripe",
  provider_payment_id: "ch_other",
  created_at: "2026-11-05T20:00:00Z",
  updated_at: "2026-11-05T20:00:00Z",
  metadata: { source: "provider_sync", appointment_id: OTHER_APPT_ID },
};

function cristinaDb() {
  return fakeDb({
    invoices: [inv106],
    payments: [manualCloseoutRow, providerSyncRow, otherAppointmentRow],
    appointment_items: [],
    workspace_settings: [],
  });
}

// ---------------------------------------------------------------------------

describe("resolveAppointmentPaymentRows", () => {
  it("resolves BOTH rows for the INV-106 shape: invoice-bound and metadata-bound, deduped", async () => {
    const rows = await resolveAppointmentPaymentRows(
      cristinaDb(),
      WS_ID,
      APPT_ID,
      cristinaAppointment.metadata,
    );
    // The sync row matches BOTH keys (invoice_id and metadata) and must
    // appear exactly once; the manual row arrives only via the invoice.
    expect(rows.map((r) => r.id)).toEqual([SYNC_PAY_ID, MANUAL_PAY_ID]);
  });

  it("excludes payments bound to other appointments", async () => {
    const rows = await resolveAppointmentPaymentRows(
      cristinaDb(),
      WS_ID,
      APPT_ID,
      cristinaAppointment.metadata,
    );
    expect(rows.map((r) => r.id)).not.toContain(OTHER_PAY_ID);
  });

  it("honors the status filter across both resolution paths", async () => {
    const rows = await resolveAppointmentPaymentRows(
      cristinaDb(),
      WS_ID,
      APPT_ID,
      cristinaAppointment.metadata,
      "succeeded",
    );
    expect(rows.map((r) => r.id)).toEqual([MANUAL_PAY_ID]);
  });

  it("resolves the invoice chain through the appointment's invoice_id write-back hint", async () => {
    const hintedAppointment: Row = {
      id: APPT_ID,
      metadata: { invoice_id: INV_ID },
    };
    const db = fakeDb({
      // The invoice carries NO appointment_id in its own metadata here;
      // only the appointment's write-back hint links it.
      invoices: [{ ...inv106, metadata: {} }],
      payments: [manualCloseoutRow],
    });
    const rows = await resolveAppointmentPaymentRows(db, WS_ID, APPT_ID, hintedAppointment.metadata);
    expect(rows.map((r) => r.id)).toEqual([MANUAL_PAY_ID]);
  });
});

describe("composeAppointmentPaymentState", () => {
  it("composes the INV-106 facts: paid 133.83 of 133.83, balance 0", async () => {
    const state = await composeAppointmentPaymentState(cristinaDb(), WS_ID, cristinaAppointment);
    expect(state).not.toBeNull();
    expect(state?.invoice_id).toBe(INV_ID);
    expect(state?.invoice_status).toBe("paid");
    expect(state?.total).toBe(133.83);
    expect(state?.amount_paid).toBe(133.83);
    expect(state?.balance).toBe(0);
  });

  it("returns null when the appointment has no invoice", async () => {
    const db = fakeDb({ invoices: [], payments: [providerSyncRow] });
    const state = await composeAppointmentPaymentState(db, WS_ID, cristinaAppointment);
    expect(state).toBeNull();
  });

  it("composes a partial balance from the invoice facts", async () => {
    const db = fakeDb({
      invoices: [{ ...inv106, total: 200, amount_paid: 75, status: "partially_paid" }],
    });
    const state = await composeAppointmentPaymentState(db, WS_ID, cristinaAppointment);
    expect(state?.total).toBe(200);
    expect(state?.amount_paid).toBe(75);
    expect(state?.balance).toBe(125);
  });
});

describe("linkAppointmentInvoices", () => {
  it("skips void invoices and lets the latest non-void invoice win", async () => {
    const older: Row = {
      ...inv106,
      id: "ff0e8400-e29b-41d4-a716-4466554400ff",
      status: "issued",
      created_at: "2026-11-04T10:00:00Z",
    };
    const voided: Row = {
      ...inv106,
      id: "ff0e8400-e29b-41d4-a716-4466554400ee",
      status: "void",
      created_at: "2026-11-06T10:00:00Z",
    };
    const db = fakeDb({ invoices: [older, inv106, voided] });
    const linked = await linkAppointmentInvoices(db, WS_ID, [cristinaAppointment]);
    expect(linked.get(APPT_ID)?.id).toBe(INV_ID);
  });
});

describe("linkAppointmentInvoices — production PostgREST regression", () => {
  it("links by invoice metadata.appointment_id with only an eq workspace fetch (prod fake)", async () => {
    // The appointment carries NO invoice_id hint; the only binding is
    // the invoice's own metadata. The old linker fetched that binding
    // through `.filter("metadata->>appointment_id", "in", ...)` — under
    // the prod fake (and in production) that leg returns nothing.
    const bareAppointment: Row = { id: APPT_ID, workspace_id: WS_ID, metadata: {} };
    const db = fakeProdDb({ invoices: [inv106] });
    const linked = await linkAppointmentInvoices(db, WS_ID, [bareAppointment]);
    expect(linked.get(APPT_ID)?.id).toBe(INV_ID);
  });

  it("links by the appointment's invoice_id hint (prod fake)", async () => {
    // The invoice carries NO appointment_id in its own metadata; only
    // the appointment's write-back hint links it. The old linker's hint
    // leg fetched by `.in("id", ...)` — also dead under the prod fake.
    const hintedAppointment: Row = {
      id: APPT_ID,
      workspace_id: WS_ID,
      metadata: { invoice_id: INV_ID },
    };
    const db = fakeProdDb({ invoices: [{ ...inv106, metadata: {} }] });
    const linked = await linkAppointmentInvoices(db, WS_ID, [hintedAppointment]);
    expect(linked.get(APPT_ID)?.id).toBe(INV_ID);
  });

  it("skips void invoices and lets the latest non-void invoice win (prod fake)", async () => {
    const older: Row = {
      ...inv106,
      id: "ff0e8400-e29b-41d4-a716-4466554400ff",
      status: "issued",
      created_at: "2026-11-04T10:00:00Z",
    };
    const voided: Row = {
      ...inv106,
      id: "ff0e8400-e29b-41d4-a716-4466554400ee",
      status: "void",
      created_at: "2026-11-06T10:00:00Z",
    };
    const bareAppointment: Row = { id: APPT_ID, workspace_id: WS_ID, metadata: {} };
    const db = fakeProdDb({ invoices: [older, inv106, voided] });
    const linked = await linkAppointmentInvoices(db, WS_ID, [bareAppointment]);
    expect(linked.get(APPT_ID)?.id).toBe(INV_ID);
  });

  it("does not link invoices from another workspace (prod fake)", async () => {
    const bareAppointment: Row = { id: APPT_ID, workspace_id: WS_ID, metadata: {} };
    const foreign: Row = { ...inv106, workspace_id: "550e8400-e29b-41d4-a716-446655440999" };
    const db = fakeProdDb({ invoices: [foreign] });
    const linked = await linkAppointmentInvoices(db, WS_ID, [bareAppointment]);
    expect(linked.size).toBe(0);
  });

  it("warns loudly when hints exist but zero invoices link for the call", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const hintedAppointment: Row = {
        id: APPT_ID,
        workspace_id: WS_ID,
        metadata: { invoice_id: "bb0e8400-e29b-41d4-a716-4466554400dd" },
      };
      const db = fakeProdDb({ invoices: [inv106] });
      // The hint points at a missing invoice and inv106's metadata
      // points at a different (absent) binding under this appointment
      // set, so nothing links — the recurrence must be visible in logs.
      const linked = await linkAppointmentInvoices(db, WS_ID, [
        { ...hintedAppointment, id: OTHER_APPT_ID },
      ]);
      expect(linked.size).toBe(0);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("0 invoices linked");
    } finally {
      warn.mockRestore();
    }
  });

  it("stays silent when invoices link normally (prod fake)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bareAppointment: Row = { id: APPT_ID, workspace_id: WS_ID, metadata: {} };
      const db = fakeProdDb({ invoices: [inv106] });
      const linked = await linkAppointmentInvoices(db, WS_ID, [bareAppointment]);
      expect(linked.get(APPT_ID)?.id).toBe(INV_ID);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("composeAppointmentJobMoney gives the paid job a due of 0 under the prod fake", async () => {
    // THE holdout: cristinaAppointment is a locked-quote website job
    // whose invoice is paid in full. When linking silently returns an
    // empty map, composition falls back to the locked quote and the
    // card renders "Due $133.83" — this must not happen.
    const db = fakeProdDb({
      invoices: [inv106],
      appointment_items: [],
      workspace_settings: [],
    });
    const money = await composeAppointmentJobMoney(db, WS_ID, [cristinaAppointment]);
    expect(money.get(APPT_ID)?.total).toBe(133.83);
    expect(money.get(APPT_ID)?.due).toBe(0);
    expect(money.get(APPT_ID)?.invoice?.invoice_id).toBe(INV_ID);
  });
});

describe("composeAppointmentJobMoney", () => {
  it("gives the paid INV-106 job a composed due of 0", async () => {
    const money = await composeAppointmentJobMoney(cristinaDb(), WS_ID, [cristinaAppointment]);
    const entry = money.get(APPT_ID);
    expect(entry?.total).toBe(133.83);
    expect(entry?.due).toBe(0);
    expect(entry?.invoice?.amount_paid).toBe(133.83);
  });

  it("keeps the locked quote verbatim as the due for an un-invoiced locked job", async () => {
    const db = fakeDb({ invoices: [], appointment_items: [], workspace_settings: [] });
    const money = await composeAppointmentJobMoney(db, WS_ID, [cristinaAppointment]);
    expect(money.get(APPT_ID)?.total).toBe(133.83);
    expect(money.get(APPT_ID)?.due).toBe(133.83);
    expect(money.get(APPT_ID)?.invoice).toBeNull();
  });

  it("composes a partial due from the invoice facts", async () => {
    const db = fakeDb({
      invoices: [{ ...inv106, total: 200, amount_paid: 75, status: "partially_paid" }],
      appointment_items: [],
      workspace_settings: [],
    });
    const money = await composeAppointmentJobMoney(db, WS_ID, [cristinaAppointment]);
    expect(money.get(APPT_ID)?.total).toBe(200);
    expect(money.get(APPT_ID)?.due).toBe(125);
  });

  it("falls back to the service-line total for an un-invoiced, unlocked job", async () => {
    const walkIn: Row = {
      id: OTHER_APPT_ID,
      workspace_id: WS_ID,
      source: "staff",
      status: "confirmed",
      metadata: {},
    };
    const db = fakeDb({
      invoices: [],
      appointment_items: [
        { appointment_id: OTHER_APPT_ID, workspace_id: WS_ID, unit_price: 100, quantity: 1 },
      ],
      workspace_settings: [],
    });
    const money = await composeAppointmentJobMoney(db, WS_ID, [walkIn]);
    expect(money.get(OTHER_APPT_ID)?.total).toBe(100);
    expect(money.get(OTHER_APPT_ID)?.due).toBe(100);
  });
});
