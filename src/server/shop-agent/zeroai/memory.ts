/**
 * ZeroMemory — compact per-caller conversational state for the Shop Agent.
 *
 * Facts, not transcripts. The model sees facts + summary only; raw message
 * bodies are never stored by this module (they live in the channel's native
 * log). extractFacts() only ever returns structured facts — nothing here
 * persists a message body.
 *
 * Table: shop_agent_conversations (DDL owned by the migration worker —
 * these are the exact column names this module reads and writes).
 */
import type {
  ConversationFacts,
  ConversationMemory,
} from "./types";

export const CONVERSATIONS_TABLE = "shop_agent_conversations";
/** Caller memory TTL — 24 hours. */
export const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
/** Rolling summary cap in characters. */
export const SUMMARY_MAX_CHARS = 600;

// ---------------------------------------------------------------------------
// Injected DB surface (structural — easy to mock, no supabase-js coupling).
// ---------------------------------------------------------------------------

export interface ConversationRow {
  workspace_id: string;
  caller_hash: string;
  state: ConversationMemory["state"];
  facts: ConversationFacts;
  summary: string;
  turn_count: number;
  updated_at: string;
  expires_at: string;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface SupabaseMemoryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          limit(n: number): Promise<QueryResult<ConversationRow[]>>;
        };
      };
    };
    upsert(
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ): Promise<QueryResult<unknown>>;
  };
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

function rowToMemory(row: ConversationRow): ConversationMemory {
  return {
    workspaceId: row.workspace_id,
    callerHash: row.caller_hash,
    state: row.state,
    facts: {
      ...row.facts,
      extra: { ...(row.facts?.extra ?? {}) },
    },
    summary: row.summary ?? "",
    turnCount: row.turn_count ?? 0,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Load the caller's memory. Returns null when no row exists or the row has
 * expired (expired rows are treated as absent; callers may delete them).
 */
export async function loadMemory(
  supabase: SupabaseMemoryClient,
  workspaceId: string,
  callerHash: string,
): Promise<ConversationMemory | null> {
  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("caller_hash", callerHash)
    .limit(1);

  if (error) {
    throw new Error(`zero-memory: failed to load memory: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) return null;

  const memory = rowToMemory(row);
  return isExpired(memory) ? null : memory;
}

/**
 * Persist memory. Upserts on (workspace_id, caller_hash); expires_at is
 * refreshed to now + 24h on every save.
 */
export async function saveMemory(
  supabase: SupabaseMemoryClient,
  memory: ConversationMemory,
): Promise<void> {
  const now = new Date();
  const row = {
    workspace_id: memory.workspaceId,
    caller_hash: memory.callerHash,
    state: memory.state,
    facts: memory.facts,
    summary: memory.summary,
    turn_count: memory.turnCount,
    updated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + MEMORY_TTL_MS).toISOString(),
  };

  const { error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .upsert(row, { onConflict: "workspace_id,caller_hash" });

  if (error) {
    throw new Error(`zero-memory: failed to save memory: ${error.message}`);
  }
}

/** True when the memory's TTL has passed. */
export function isExpired(memory: ConversationMemory): boolean {
  return new Date(memory.expiresAt).getTime() <= Date.now();
}

// ---------------------------------------------------------------------------
// Deterministic fact extraction (no model).
// ---------------------------------------------------------------------------

const emptyFacts = (): ConversationFacts => ({ extra: {} });

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Set the slot only when it is empty — never overwrite a set fact. */
function fillIfEmpty(
  facts: ConversationFacts,
  key: keyof Omit<ConversationFacts, "extra">,
  value: string,
): void {
  if (isEmpty(facts[key])) {
    (facts as unknown as Record<string, unknown>)[key] = value;
  }
}

const YEAR_RE = /\b(19\d{2}|20[0-2]\d|2030)\b/;

/** make -> canonical make (aliases collapsed). */
const MAKES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\bford\b/i, canonical: "Ford" },
  { pattern: /\btoyota\b/i, canonical: "Toyota" },
  { pattern: /\bhonda\b/i, canonical: "Honda" },
  { pattern: /\bchevrolet\b/i, canonical: "Chevrolet" },
  { pattern: /\bchevy\b/i, canonical: "Chevrolet" },
  { pattern: /\bnissan\b/i, canonical: "Nissan" },
  { pattern: /\bjeep\b/i, canonical: "Jeep" },
  { pattern: /\bdodge\b/i, canonical: "Dodge" },
  { pattern: /\bram\b/i, canonical: "Ram" },
  { pattern: /\bgmc\b/i, canonical: "GMC" },
  { pattern: /\bhyundai\b/i, canonical: "Hyundai" },
  { pattern: /\bkia\b/i, canonical: "Kia" },
  { pattern: /\bsubaru\b/i, canonical: "Subaru" },
  { pattern: /\bvolkswagen\b/i, canonical: "Volkswagen" },
  { pattern: /\bvw\b/i, canonical: "Volkswagen" },
  { pattern: /\bbmw\b/i, canonical: "BMW" },
  { pattern: /\bmercedes(?:-benz)?\b/i, canonical: "Mercedes-Benz" },
  { pattern: /\btesla\b/i, canonical: "Tesla" },
  { pattern: /\bmazda\b/i, canonical: "Mazda" },
  { pattern: /\baudi\b/i, canonical: "Audi" },
  { pattern: /\bacura\b/i, canonical: "Acura" },
  { pattern: /\blexus\b/i, canonical: "Lexus" },
  { pattern: /\binfiniti\b/i, canonical: "Infiniti" },
  { pattern: /\bchrysler\b/i, canonical: "Chrysler" },
  { pattern: /\bbuick\b/i, canonical: "Buick" },
  { pattern: /\bcadillac\b/i, canonical: "Cadillac" },
  { pattern: /\blincoln\b/i, canonical: "Lincoln" },
  { pattern: /\bporsche\b/i, canonical: "Porsche" },
  { pattern: /\bvolvo\b/i, canonical: "Volvo" },
  { pattern: /\bmitsubishi\b/i, canonical: "Mitsubishi" },
  { pattern: /\bmini\b/i, canonical: "MINI" },
];

/** Words that are never a vehicle model (stops "ford for an oil change" → "for"). */
const MODEL_STOPWORDS = new Set([
  "a", "an", "the", "for", "is", "are", "was", "needs", "need", "oil",
  "change", "service", "repair", "appointment", "quote", "price", "my", "i",
  "it", "and", "or", "to", "of", "in", "on", "with", "that", "this", "has",
  "have", "had", "from", "at", "your", "our", "me", "we", "you", "they",
  "he", "she", "do", "does", "did", "will", "would", "can", "could",
  "should", "please", "thanks", "thank", "hi", "hello", "hey", "yes", "no",
  "not", "but", "so", "if", "when", "what", "how", "much", "many",
]);

const MILEAGE_RE =
  /\b(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(?:miles|mile|mi)\b|\b(\d{1,3})\s*k\s*(?:miles|mile|mi)?\b/i;

const NAME_RE = /\b(?:my name is|this is)\s+([a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*)?)/i;

/** need keyword → canonical need label. */
const NEEDS: Array<{ pattern: RegExp; need: string }> = [
  { pattern: /oil\s*change/i, need: "oil change" },
  { pattern: /\bbrakes?\b/i, need: "brakes" },
  { pattern: /\btires?\b/i, need: "tires" },
  { pattern: /\bbattery\b/i, need: "battery" },
  { pattern: /\binspection\b/i, need: "inspection" },
  { pattern: /\bair\s*conditioning\b|\b a\/c \b|\bac\b/i, need: "A/C" },
  { pattern: /\btransmission\b/i, need: "transmission" },
  { pattern: /\balignment\b/i, need: "alignment" },
];

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function extractModelAfterMake(message: string, afterIndex: number): string | null {
  const rest = message.slice(afterIndex).trim();
  const tokens = rest.split(/\s+/).slice(0, 2);
  const cleaned = tokens
    .map((t) => t.replace(/[^a-z0-9-]/gi, ""))
    .filter((t) => t.length > 0 && !MODEL_STOPWORDS.has(t.toLowerCase()));
  if (cleaned.length === 0) return null;
  // A model token is usually a name or an alphanumeric trim code.
  const first = cleaned[0];
  if (/^\d+$/.test(first) && first.length >= 4) return null; // a year, not a model
  return cleaned
    .slice(0, 2)
    .map((t) => (/^[a-z0-9-]*\d[a-z0-9-]*$/i.test(t) ? t.toUpperCase() : titleCase(t)))
    .join(" ");
}

/**
 * Deterministically extract facts from one customer message.
 * Merges into `existing`: only empty slots are filled — an already-set
 * fact is never overwritten by a lower-confidence guess.
 */
export function extractFacts(
  existing: ConversationFacts,
  message: string,
): ConversationFacts {
  const facts: ConversationFacts = {
    ...existing,
    extra: { ...(existing.extra ?? {}) },
  };

  const yearMatch = YEAR_RE.exec(message);
  if (yearMatch) fillIfEmpty(facts, "vehicleYear", yearMatch[1]);

  for (const { pattern, canonical } of MAKES) {
    const match = pattern.exec(message);
    if (!match) continue;
    fillIfEmpty(facts, "vehicleMake", canonical);
    if (isEmpty(facts.vehicleModel)) {
      const model = extractModelAfterMake(
        message,
        match.index + match[0].length,
      );
      if (model) facts.vehicleModel = model;
    }
    break;
  }

  const mileageMatch = MILEAGE_RE.exec(message);
  if (mileageMatch) {
    const raw = (mileageMatch[1] ?? mileageMatch[2] ?? "").replace(/,/g, "");
    const normalized = mileageMatch[2] !== undefined ? `${raw}000` : raw;
    if (/^\d+$/.test(normalized)) {
      fillIfEmpty(facts, "vehicleMileage", normalized);
    }
  }

  const nameMatch = NAME_RE.exec(message);
  if (nameMatch) {
    const name = nameMatch[1]
      .split(/\s+/)
      .map((part) => titleCase(part.replace(/[.'-]+$/g, "")))
      .filter((part) => part.length > 0)
      .join(" ");
    if (name.length > 0) fillIfEmpty(facts, "customerName", name);
  }

  if (isEmpty(facts.need)) {
    for (const { pattern, need } of NEEDS) {
      if (pattern.test(message)) {
        facts.need = need;
        break;
      }
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Summary compaction
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Append one short fact-sentence about the latest exchange to the rolling
 * summary. Caps at ~SUMMARY_MAX_CHARS, dropping the oldest sentences first.
 */
export function compactSummary(
  previous: string,
  latestExchange: string,
): string {
  const sentences = splitSentences(previous);
  const latest = latestExchange.trim().replace(/\s+/g, " ");
  if (latest.length > 0) {
    const oneSentence =
      latest.length > 140 ? `${latest.slice(0, 137).trimEnd()}…` : latest;
    sentences.push(oneSentence);
  }
  let joined = sentences.join(" ");
  while (joined.length > SUMMARY_MAX_CHARS && sentences.length > 1) {
    sentences.shift();
    joined = sentences.join(" ");
  }
  return joined;
}

// ---------------------------------------------------------------------------
// Factories / helpers
// ---------------------------------------------------------------------------

/** Fresh blank facts object (extra always present). */
export function blankFacts(): ConversationFacts {
  return emptyFacts();
}

/**
 * Merge deterministically-extracted facts into existing memory facts —
 * only empty slots are filled.
 */
export function mergeFacts(
  existing: ConversationFacts,
  extracted: Partial<ConversationFacts>,
): ConversationFacts {
  const merged: ConversationFacts = {
    ...existing,
    extra: { ...(existing.extra ?? {}) },
  };
  for (const [key, value] of Object.entries(extracted)) {
    if (key === "extra" || isEmpty(value)) continue;
    if (isEmpty((merged as unknown as Record<string, unknown>)[key])) {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  if (extracted.extra) {
    for (const [key, value] of Object.entries(extracted.extra)) {
      if (isEmpty(merged.extra[key]) && !isEmpty(value)) {
        merged.extra[key] = value;
      }
    }
  }
  return merged;
}
