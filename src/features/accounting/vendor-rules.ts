import {
  ACCOUNTING_CLASSIFICATIONS,
  type AccountingClassification,
} from "./accounting-engine";

/**
 * Standing vendor classification rules.
 *
 * A rule says: when a bank transaction's description mentions a vendor,
 * the transaction reads as a fixed accounting classification — no matter
 * what classification was stored at import time. Rules are applied when
 * classifications are READ (the shared bank-transaction read), never by
 * rewriting stored bank rows, so Accounting, the Financials Overview and
 * the Expenses view can never disagree about a transaction.
 *
 * Rules are per-workspace data, stored on the workspace's bookkeeping
 * settings (`vendor_classification_rules`). A workspace that has never
 * saved rules (stored value null) gets the product defaults below; a
 * workspace that saves its own list — including an empty list — replaces
 * the defaults entirely.
 */
export type VendorClassificationRule = {
  /** Case-insensitive substring matched against the bank description. */
  match: string;
  classification: AccountingClassification;
};

/**
 * Product default standing rules, applied to any workspace that has not
 * configured its own. First standing rule (owner ruling, Nov 2026): NAPA
 * purchases are inventory — stock bought to be used on jobs — not loose
 * parts/tools spend.
 */
export const DEFAULT_VENDOR_CLASSIFICATION_RULES: VendorClassificationRule[] = [
  { match: "NAPA", classification: "inventory" },
];

const CLASSIFICATION_SET = new Set<string>(ACCOUNTING_CLASSIFICATIONS);

/**
 * Validate an unknown stored value into a rule list.
 * Returns null when the workspace has not configured rules at all
 * (null/undefined/non-array), so callers can distinguish "not configured"
 * from "configured as an empty list".
 */
export function normalizeVendorClassificationRules(value: unknown): VendorClassificationRule[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const rules: VendorClassificationRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const match = (entry as { match?: unknown }).match;
    const classification = (entry as { classification?: unknown }).classification;
    if (typeof match !== "string" || match.trim().length === 0) continue;
    if (typeof classification !== "string" || !CLASSIFICATION_SET.has(classification)) continue;
    rules.push({ match: match.trim(), classification: classification as AccountingClassification });
  }
  return rules;
}

/** The rules in force for a workspace: its own list when configured, else the product defaults. */
export function resolveVendorClassificationRules(
  configured: VendorClassificationRule[] | null | undefined,
): VendorClassificationRule[] {
  return configured ?? DEFAULT_VENDOR_CLASSIFICATION_RULES;
}

/** First rule whose match appears in the description (case-insensitive), or null. */
export function findVendorClassificationRule(
  description: string,
  rules: readonly VendorClassificationRule[],
): VendorClassificationRule | null {
  const haystack = description.toUpperCase();
  for (const rule of rules) {
    if (rule.match && haystack.includes(rule.match.toUpperCase())) return rule;
  }
  return null;
}

/**
 * Return rows with each classification resolved through the standing
 * rules. Rows a rule reclassifies are shallow copies; every other row is
 * returned by reference, and the input array is never mutated.
 */
export function applyVendorClassificationRules<T extends { classification: AccountingClassification }>(
  rows: readonly T[],
  descriptionOf: (row: T) => string,
  rules: readonly VendorClassificationRule[],
): T[] {
  if (rules.length === 0) return [...rows];
  return rows.map((row) => {
    const rule = findVendorClassificationRule(descriptionOf(row), rules);
    if (!rule || rule.classification === row.classification) return row;
    return { ...row, classification: rule.classification };
  });
}
