/**
 * ZeroLedger — hash-chained, tamper-evident event log for the Shop Agent.
 *
 * Every agent action appends exactly one event. Each event's hash covers the
 * canonical payload plus the previous event's hash, so any later tampering
 * with any row breaks the chain and verifyChain reports where.
 *
 * The supabase client is injected (structural interface, no live dependency).
 * Table: shop_agent_ledger (DDL owned by the migration worker — these are the
 * exact column names this module reads and writes).
 */
import { sha256Hex } from "./types";
import type { LedgerRecord, ZeroEvent } from "./types";

export const LEDGER_TABLE = "shop_agent_ledger";
export const GENESIS_PARENT_HASH = "GENESIS";

// ---------------------------------------------------------------------------
// Injected DB surface (structural — easy to mock, no supabase-js coupling).
// ---------------------------------------------------------------------------

export interface LedgerRow {
  workspace_id: string;
  event_id: string;
  actor: string;
  action: string;
  occurred_at: string;
  input_hash: string;
  output_hash: string;
  parent_hash: string;
  event_hash: string;
  evidence: { evidenceRefs: string[] };
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface SupabaseLedgerClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        order(
          column: string,
          opts: { ascending: boolean },
        ): {
          limit(n: number): Promise<QueryResult<LedgerRow[]>>;
        } & Promise<QueryResult<LedgerRow[]>>;
      };
    };
    insert(
      row: Record<string, unknown>,
    ): Promise<QueryResult<unknown>>;
  };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** sha256 of a deterministically-ordered (stable) JSON serialization. */
export function hashPayload(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) =>
      `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
  );
  return `{${entries.join(",")}}`;
}

/**
 * The canonical event payload whose hash chains the ledger.
 * Keys are in FIXED order — insertion order is the canonicalization.
 * Optional fields use stable defaults so hashing is deterministic.
 */
export function canonicalEventPayload(event: ZeroEvent): string {
  const canonical = {
    eventId: event.eventId,
    workspaceId: event.workspaceId,
    actor: event.actor,
    action: event.action,
    timestamp: event.timestamp,
    inputHash: event.inputHash,
    outputHash: event.outputHash ?? "",
    parentHash: event.parentHash,
    evidenceRefs: event.evidenceRefs ?? [],
  };
  return JSON.stringify(canonical);
}

export function hashEvent(event: ZeroEvent): string {
  return sha256Hex(canonicalEventPayload(event));
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

/**
 * Append one event to the workspace's chain.
 * parentHash = latest eventHash for the workspace ("GENESIS" when the
 * chain is empty).
 */
export async function appendEvent(
  supabase: SupabaseLedgerClient,
  event: ZeroEvent,
): Promise<LedgerRecord> {
  const { data: latest, error: latestError } = await supabase
    .from(LEDGER_TABLE)
    .select("event_hash")
    .eq("workspace_id", event.workspaceId)
    .order("occurred_at", { ascending: false })
    .limit(1);

  if (latestError) {
    throw new Error(
      `zero-ledger: failed to read latest event: ${latestError.message}`,
    );
  }

  const parentHash =
    latest && latest.length > 0 ? latest[0].event_hash : GENESIS_PARENT_HASH;

  const chained: ZeroEvent = { ...event, parentHash };
  const eventHash = hashEvent(chained);

  const row = {
    workspace_id: chained.workspaceId,
    event_id: chained.eventId,
    actor: chained.actor,
    action: chained.action,
    occurred_at: chained.timestamp,
    input_hash: chained.inputHash,
    output_hash: chained.outputHash ?? "",
    parent_hash: chained.parentHash,
    event_hash: eventHash,
    evidence: { evidenceRefs: chained.evidenceRefs ?? [] },
  };

  const { error: insertError } = await supabase
    .from(LEDGER_TABLE)
    .insert(row);

  if (insertError) {
    throw new Error(
      `zero-ledger: failed to append event: ${insertError.message}`,
    );
  }

  return {
    eventId: chained.eventId,
    workspaceId: chained.workspaceId,
    actor: chained.actor,
    action: chained.action,
    timestamp: chained.timestamp,
    inputHash: chained.inputHash,
    outputHash: chained.outputHash,
    parentHash: chained.parentHash,
    evidenceRefs: chained.evidenceRefs ?? [],
    eventHash,
  };
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export interface ChainVerification {
  ok: boolean;
  /** event_id of the first broken link, when ok === false. */
  brokenAt?: string;
  /** human-readable reason for the break. */
  reason?: string;
}

/**
 * Recompute every hash and parent linkage in the workspace's chain.
 * Reports the first event where the chain breaks (tampered payload or
 * relinked parent).
 */
export async function verifyChain(
  supabase: SupabaseLedgerClient,
  workspaceId: string,
): Promise<ChainVerification> {
  const { data: rows, error } = await supabase
    .from(LEDGER_TABLE)
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: true });

  if (error) {
    throw new Error(
      `zero-ledger: failed to read chain: ${error.message}`,
    );
  }

  const chain = rows ?? [];
  let expectedParent = GENESIS_PARENT_HASH;

  for (const row of chain) {
    const event: ZeroEvent = {
      eventId: row.event_id,
      workspaceId: row.workspace_id,
      actor: row.actor,
      action: row.action,
      timestamp: row.occurred_at,
      inputHash: row.input_hash,
      outputHash: row.output_hash,
      parentHash: row.parent_hash,
      evidenceRefs: row.evidence?.evidenceRefs ?? [],
    };

    if (hashEvent(event) !== row.event_hash) {
      return {
        ok: false,
        brokenAt: row.event_id,
        reason: "event_hash does not match recomputed hash (payload tampered)",
      };
    }

    if (row.parent_hash !== expectedParent) {
      return {
        ok: false,
        brokenAt: row.event_id,
        reason:
          "parent_hash does not match previous event_hash (chain relinked)",
      };
    }

    expectedParent = row.event_hash;
  }

  return { ok: true };
}
