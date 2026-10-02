/**
 * Shared ZeroLedger write helper for the Shop Agent channels.
 *
 * Builds the full ZeroEvent (the ledger worker computes parentHash /
 * eventHash from it) and appends it with a best-effort policy: a ledger
 * write failure is logged but never fails the channel operation — an
 * already-accepted SMS must not become a webhook 500 (Twilio would retry
 * and double-text).
 */
import { appendEvent, GENESIS_PARENT_HASH } from "../zeroai/ledger";
import type { SupabaseLedgerClient } from "../zeroai/ledger";
import type { ZeroEvent } from "../zeroai/types";

export interface NewLedgerEventInput {
  workspaceId: string;
  actor: string;
  action: string;
  inputHash: string;
  outputHash?: string;
  evidenceRefs?: string[];
  timestamp?: string;
}

export function newLedgerEvent(input: NewLedgerEventInput): ZeroEvent {
  return {
    eventId: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: input.action,
    timestamp: input.timestamp ?? new Date().toISOString(),
    inputHash: input.inputHash,
    outputHash: input.outputHash,
    // Computed by appendEvent from the workspace's chain head.
    parentHash: GENESIS_PARENT_HASH,
    evidenceRefs: input.evidenceRefs ?? [],
  };
}

export async function logLedgerEvent(
  supabase: unknown,
  event: ZeroEvent,
): Promise<void> {
  try {
    await appendEvent(supabase as unknown as SupabaseLedgerClient, event);
  } catch (error) {
    console.error("shop_agent_ledger_failed", {
      action: event.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
