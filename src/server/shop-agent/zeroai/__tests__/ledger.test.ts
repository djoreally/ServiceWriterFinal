import {
  appendEvent,
  GENESIS_PARENT_HASH,
  hashEvent,
  hashPayload,
  LEDGER_TABLE,
  verifyChain,
} from "../ledger";
import type {
  LedgerRow,
  SupabaseLedgerClient,
} from "../ledger";
import type { ZeroEvent } from "../types";

function makeEvent(overrides: Partial<ZeroEvent> = {}): ZeroEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: "ws-1",
    actor: "+12155550123",
    action: "send_message",
    timestamp: new Date().toISOString(),
    inputHash: hashPayload({ body: "hello" }),
    outputHash: hashPayload({ sent: true }),
    parentHash: "unset",
    evidenceRefs: ["sms:SM123"],
    ...overrides,
  };
}

function makeMock(initial: LedgerRow[] = []) {
  const store: LedgerRow[] = [...initial];
  const client = {
    from(table: string) {
      if (table !== LEDGER_TABLE) {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select(_cols: string) {
          return {
            eq(_col: string, value: unknown) {
              const filtered = store.filter(
                (r) => r.workspace_id === value,
              );
              return {
                order(_col: string, opts: { ascending: boolean }) {
                  const sorted = [...filtered].sort((a, b) =>
                    opts.ascending
                      ? a.occurred_at.localeCompare(b.occurred_at)
                      : b.occurred_at.localeCompare(a.occurred_at),
                  );
                  return {
                    limit: (n: number) =>
                      Promise.resolve({
                        data: sorted.slice(0, n),
                        error: null,
                      }),
                    then: (
                      resolve: (v: unknown) => void,
                      reject: (e: unknown) => void,
                    ) =>
                      Promise.resolve({ data: sorted, error: null }).then(
                        resolve,
                        reject,
                      ),
                  };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          store.push(row as unknown as LedgerRow);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as SupabaseLedgerClient;
  return { client, store };
}

describe("hashPayload", () => {
  it("is deterministic and key-order independent", () => {
    const a = hashPayload({ b: 1, a: [3, 2] });
    const b = hashPayload({ a: [3, 2], b: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinguishes different payloads", () => {
    expect(hashPayload({ x: 1 })).not.toBe(hashPayload({ x: 2 }));
  });
});

describe("appendEvent", () => {
  it("uses GENESIS as parentHash for the first event and chains after", async () => {
    const { client, store } = makeMock();
    const ts = (s: string) => `2026-10-01T10:00:0${s}.000Z`;

    const r1 = await appendEvent(client, makeEvent({ eventId: "evt-1", timestamp: ts("0") }));
    expect(r1.parentHash).toBe(GENESIS_PARENT_HASH);
    expect(r1.eventHash).toBe(hashEvent({ ...makeEvent({ eventId: "evt-1", timestamp: ts("0") }), parentHash: GENESIS_PARENT_HASH }));

    const r2 = await appendEvent(client, makeEvent({ eventId: "evt-2", timestamp: ts("1") }));
    expect(r2.parentHash).toBe(r1.eventHash);

    const r3 = await appendEvent(client, makeEvent({ eventId: "evt-3", timestamp: ts("2") }));
    expect(r3.parentHash).toBe(r2.eventHash);

    expect(store).toHaveLength(3);
    const inserted = store[0];
    expect(inserted).toMatchObject({
      workspace_id: "ws-1",
      event_id: "evt-1",
      parent_hash: GENESIS_PARENT_HASH,
      event_hash: r1.eventHash,
      evidence: { evidenceRefs: ["sms:SM123"] },
    });
  });

  it("scopes the chain to the workspace", async () => {
    const { client } = makeMock();
    const a = await appendEvent(client, makeEvent({ workspaceId: "ws-A" }));
    const b = await appendEvent(client, makeEvent({ workspaceId: "ws-B" }));
    expect(a.parentHash).toBe(GENESIS_PARENT_HASH);
    expect(b.parentHash).toBe(GENESIS_PARENT_HASH);
  });

  it("throws on read failure", async () => {
    const bad = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: null,
                  error: { message: "db down" },
                }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseLedgerClient;
    await expect(appendEvent(bad, makeEvent())).rejects.toThrow(
      /failed to read latest event/,
    );
  });
});

describe("verifyChain", () => {
  it("verifies a 3-event chain as ok", async () => {
    const { client } = makeMock();
    const ts = (s: string) => `2026-10-01T10:00:0${s}.000Z`;
    await appendEvent(client, makeEvent({ eventId: "evt-1", timestamp: ts("0") }));
    await appendEvent(client, makeEvent({ eventId: "evt-2", timestamp: ts("1") }));
    await appendEvent(client, makeEvent({ eventId: "evt-3", timestamp: ts("2") }));

    const result = await verifyChain(client, "ws-1");
    expect(result).toEqual({ ok: true });
  });

  it("reports the tampered row", async () => {
    const { client, store } = makeMock();
    const ts = (s: string) => `2026-10-01T10:00:0${s}.000Z`;
    await appendEvent(client, makeEvent({ eventId: "evt-1", timestamp: ts("0") }));
    await appendEvent(client, makeEvent({ eventId: "evt-2", timestamp: ts("1") }));
    await appendEvent(client, makeEvent({ eventId: "evt-3", timestamp: ts("2") }));

    // Tamper with the middle row's payload after the fact.
    store[1].input_hash = "tampered";

    const result = await verifyChain(client, "ws-1");
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe("evt-2");
    expect(result.reason).toMatch(/tampered/);
  });

  it("reports a relinked chain", async () => {
    const { client, store } = makeMock();
    const ts = (s: string) => `2026-10-01T10:00:0${s}.000Z`;
    await appendEvent(client, makeEvent({ eventId: "evt-1", timestamp: ts("0") }));
    await appendEvent(client, makeEvent({ eventId: "evt-2", timestamp: ts("1") }));

    store[1].parent_hash = "forged";
    // Recompute the hash so the payload check passes but the link is wrong.
    store[1].event_hash = hashEvent({
      eventId: store[1].event_id,
      workspaceId: store[1].workspace_id,
      actor: store[1].actor,
      action: store[1].action,
      timestamp: store[1].occurred_at,
      inputHash: store[1].input_hash,
      outputHash: store[1].output_hash,
      parentHash: store[1].parent_hash,
      evidenceRefs: store[1].evidence.evidenceRefs,
    });

    const result = await verifyChain(client, "ws-1");
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe("evt-2");
    expect(result.reason).toMatch(/parent_hash/);
  });

  it("treats an empty chain as ok", async () => {
    const { client } = makeMock();
    expect(await verifyChain(client, "ws-1")).toEqual({ ok: true });
  });
});
