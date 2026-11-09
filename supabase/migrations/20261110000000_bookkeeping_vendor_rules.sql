-- Bookkeeping standing vendor classification rules.
-- Additive; does not alter existing bookkeeping, expense, invoice or payment behavior.
--
-- vendor_classification_rules holds a workspace's standing rules as a
-- JSON array of { "match": string, "classification": string } entries.
-- NULL means the workspace has not configured rules and the product
-- default standing rules apply at read time; an empty array means the
-- workspace has explicitly configured no rules. Rules are applied when
-- bank classifications are read, never by rewriting stored bank rows.
-- Row level security is unchanged: the column inherits the existing
-- bookkeeping_settings policies.

alter table public.bookkeeping_settings
  add column if not exists vendor_classification_rules jsonb;
