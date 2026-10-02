import {
  blankFacts,
  compactSummary,
  CONVERSATIONS_TABLE,
  extractFacts,
  isExpired,
  loadMemory,
  MEMORY_TTL_MS,
  mergeFacts,
  saveMemory,
  SUMMARY_MAX_CHARS,
} from "../memory";
import type { ConversationRow, SupabaseMemoryClient } from "../memory";
import type { ConversationFacts, ConversationMemory } from "../types";

function makeRow(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    workspace_id: "ws-1",
    caller_hash: "abc123",
    state: "greeted",
    facts: blankFacts(),
    summary: "",
    turn_count: 1,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + MEMORY_TTL_MS).toISOString(),
    ...overrides,
  };
}

function makeMock(initial: ConversationRow[] = []) {
  const store: ConversationRow[] = [...initial];
  let lastUpsertArgs: { row: Record<string, unknown>; opts: unknown } | null =
    null;
  const client = {
    from(table: string) {
      if (table !== CONVERSATIONS_TABLE) {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select(_cols: string) {
          return {
            eq(_col: string, v1: unknown) {
              return {
                eq(_col2: string, v2: unknown) {
                  return {
                    limit: (_n: number) =>
                      Promise.resolve({
                        data: store.filter(
                          (r) =>
                            r.workspace_id === v1 && r.caller_hash === v2,
                        ),
                        error: null,
                      }),
                  };
                },
              };
            },
          };
        },
        upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
          lastUpsertArgs = { row, opts };
          const idx = store.findIndex(
            (r) =>
              r.workspace_id === row.workspace_id &&
              r.caller_hash === row.caller_hash,
          );
          if (idx >= 0) store[idx] = row as unknown as ConversationRow;
          else store.push(row as unknown as ConversationRow);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    get lastUpsertArgs() {
      return lastUpsertArgs;
    },
  } as unknown as SupabaseMemoryClient & {
    lastUpsertArgs: { row: Record<string, unknown>; opts: unknown } | null;
  };
  return { client, store };
}

describe("loadMemory", () => {
  it("returns null when no row exists", async () => {
    const { client } = makeMock();
    expect(await loadMemory(client, "ws-1", "nope")).toBeNull();
  });

  it("returns null when the row is expired", async () => {
    const { client } = makeMock([
      makeRow({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    ]);
    expect(await loadMemory(client, "ws-1", "abc123")).toBeNull();
  });

  it("returns mapped memory when the row is live", async () => {
    const { client } = makeMock([
      makeRow({ state: "vehicle_known", summary: "Customer drives a Civic." }),
    ]);
    const mem = await loadMemory(client, "ws-1", "abc123");
    expect(mem).not.toBeNull();
    expect(mem?.workspaceId).toBe("ws-1");
    expect(mem?.callerHash).toBe("abc123");
    expect(mem?.state).toBe("vehicle_known");
    expect(mem?.summary).toBe("Customer drives a Civic.");
  });
});

describe("saveMemory", () => {
  it("upserts on (workspace_id, caller_hash) with a 24h expiry", async () => {
    const { client } = makeMock();
    const before = Date.now();
    const memory: ConversationMemory = {
      workspaceId: "ws-1",
      callerHash: "abc123",
      state: "need_identified",
      facts: { ...blankFacts(), need: "oil change" },
      summary: "Customer needs an oil change.",
      turnCount: 3,
      updatedAt: new Date(before).toISOString(),
      expiresAt: new Date(before).toISOString(),
    };
    await saveMemory(client, memory);

    const args = (client as { lastUpsertArgs: { row: Record<string, unknown>; opts: { onConflict: string } } }).lastUpsertArgs;
    expect(args).not.toBeNull();
    expect(args.opts.onConflict).toBe("workspace_id,caller_hash");
    expect(args.row.workspace_id).toBe("ws-1");
    expect(args.row.caller_hash).toBe("abc123");
    expect(args.row.state).toBe("need_identified");

    const expiresAt = new Date(args.row.expires_at as string).getTime();
    expect(expiresAt).toBeGreaterThan(before + MEMORY_TTL_MS - 60_000);
    expect(expiresAt).toBeLessThanOrEqual(before + MEMORY_TTL_MS + 60_000);
  });
});

describe("isExpired", () => {
  it("true when expiresAt is in the past, false when in the future", () => {
    const past = {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    } as ConversationMemory;
    const future = {
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    } as ConversationMemory;
    expect(isExpired(past)).toBe(true);
    expect(isExpired(future)).toBe(false);
  });
});

describe("extractFacts", () => {
  it("extracts year, make, model, mileage, name, and need", () => {
    const facts = extractFacts(
      blankFacts(),
      "Hi, I need an oil change for my 2019 Honda Civic, it has 120,000 miles. My name is Tyreese.",
    );
    expect(facts.vehicleYear).toBe("2019");
    expect(facts.vehicleMake).toBe("Honda");
    expect(facts.vehicleModel).toBe("Civic");
    expect(facts.vehicleMileage).toBe("120000");
    expect(facts.customerName).toBe("Tyreese");
    expect(facts.need).toBe("oil change");
  });

  it("normalizes 120k mileage", () => {
    const facts = extractFacts(blankFacts(), "my truck has 120k on it");
    expect(facts.vehicleMileage).toBe("120000");
  });

  it("collapses chevy to Chevrolet", () => {
    const facts = extractFacts(blankFacts(), "2015 chevy silverado");
    expect(facts.vehicleMake).toBe("Chevrolet");
    expect(facts.vehicleModel).toBe("Silverado");
  });

  it("does not extract a model from filler words", () => {
    const facts = extractFacts(blankFacts(), "I drive a ford for an oil change");
    expect(facts.vehicleMake).toBe("Ford");
    expect(facts.vehicleModel).toBeUndefined();
  });

  it("never overwrites an already-set fact", () => {
    const existing: ConversationFacts = {
      ...blankFacts(),
      vehicleMake: "Toyota",
      vehicleYear: "2020",
    };
    const facts = extractFacts(existing, "actually it's my ford f-150, a 2018");
    expect(facts.vehicleMake).toBe("Toyota");
    expect(facts.vehicleYear).toBe("2020");
    // Empty slots still fill.
    expect(facts.vehicleModel).toBe("F-150");
  });

  it("fills empty slots while leaving set ones alone", () => {
    const existing: ConversationFacts = {
      ...blankFacts(),
      customerName: "Tyreese",
    };
    const facts = extractFacts(existing, "my name is Marcus and I drive a 2021 jeep");
    expect(facts.customerName).toBe("Tyreese");
    expect(facts.vehicleYear).toBe("2021");
    expect(facts.vehicleMake).toBe("Jeep");
  });
});

describe("mergeFacts", () => {
  it("only fills empty slots, including extra keys", () => {
    const merged = mergeFacts(
      { ...blankFacts(), need: "oil change", extra: { color: "red" } },
      {
        need: "brakes",
        vehicleMake: "Honda",
        extra: { color: "blue", trim: "EX" },
      },
    );
    expect(merged.need).toBe("oil change");
    expect(merged.vehicleMake).toBe("Honda");
    expect(merged.extra.color).toBe("red");
    expect(merged.extra.trim).toBe("EX");
  });
});

describe("compactSummary", () => {
  it("appends the latest exchange as one sentence", () => {
    const out = compactSummary(
      "Customer asked about hours.",
      "Customer confirmed Tuesday 9am works.",
    );
    expect(out).toBe(
      "Customer asked about hours. Customer confirmed Tuesday 9am works.",
    );
  });

  it("caps at ~600 chars, dropping oldest sentences first", () => {
    const sentence = "A".repeat(90) + ".";
    const previous = Array.from({ length: 12 }, (_, i) => `S${i} ${sentence}`).join(" ");
    expect(previous.length).toBeGreaterThan(SUMMARY_MAX_CHARS);
    const out = compactSummary(previous, "Customer confirmed Tuesday 9am works.");
    expect(out.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(out).toContain("Customer confirmed Tuesday 9am works.");
    expect(out).not.toContain("S0"); // oldest dropped
  });

  it("handles an empty previous summary", () => {
    expect(compactSummary("", "Customer drives a 2019 Civic.")).toBe(
      "Customer drives a 2019 Civic.",
    );
  });
});

describe("no raw message bodies are stored", () => {
  it("extractFacts returns only structured facts", async () => {
    const { client, store } = makeMock();
    const body = "my secret phrase is banana-bread";
    const facts = extractFacts(blankFacts(), body);
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toContain("banana-bread");

    const memory: ConversationMemory = {
      workspaceId: "ws-1",
      callerHash: "abc123",
      state: "greeted",
      facts,
      summary: compactSummary("", "Customer greeted the shop."),
      turnCount: 1,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + MEMORY_TTL_MS).toISOString(),
    };
    await saveMemory(client, memory);
    expect(JSON.stringify(store[0])).not.toContain("banana-bread");
  });
});
