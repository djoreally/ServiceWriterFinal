import fs from "node:fs";

const failures = [];
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, "utf8");

const v1Path = "supabase/migrations/20261001214000_canonical_financial_authority_v1.sql";
const v2Path = "supabase/migrations/20261001221500_financial_authority_invoice_write_v2.sql";
const quotePath = "supabase/migrations/20261001223000_canonical_quote_financial_authority_v1.sql";
const snapshotPath = "app/api/v1/appointments/[id]/financials/route.ts";

for (const path of [v1Path, v2Path, quotePath, snapshotPath]) {
  if (!exists(path)) failures.push(`Missing financial-authority artifact: ${path}`);
}

if (exists(v1Path)) {
  const source = read(v1Path);
  for (const contract of [
    "money_round_v1",
    "sync_appointment_invoice_v1",
    "financial_integrity_issues_v1",
    "is_appointment_item_billable_v1",
  ]) {
    if (!source.includes(contract)) failures.push(`${v1Path}: missing ${contract}`);
  }
  if (!source.includes("Persisted commercial lines are the source of truth")) {
    failures.push(`${v1Path}: canonical persisted-line authority declaration is missing`);
  }
}

if (exists(v2Path)) {
  const source = read(v2Path);
  for (const contract of ["create_invoice_v1", "patch_draft_invoice_v1", "v_line_subtotal", "v_subtotal", "v_total"]) {
    if (!source.includes(contract)) failures.push(`${v2Path}: missing ${contract}`);
  }
  if (!source.includes("Client-provided subtotal/tax/total are ignored")) {
    failures.push(`${v2Path}: invoice write contract must explicitly reject client-owned header totals`);
  }
  if (/subtotal\s*[,=]\s*[^\n]*(p_header|p_patch)->>'subtotal'/.test(source)) {
    failures.push(`${v2Path}: invoice subtotal must not be sourced from a client header`);
  }
  if (/tax_total\s*[,=]\s*[^\n]*(p_header|p_patch)->>'(?:tax|tax_total|tax_amount)'/.test(source)) {
    failures.push(`${v2Path}: invoice tax must not be sourced from a client header`);
  }
  if (/total\s*[,=]\s*[^\n]*(p_header|p_patch)->>'total'/.test(source)) {
    failures.push(`${v2Path}: invoice total must not be sourced from a client header`);
  }
}

if (exists(quotePath)) {
  const source = read(quotePath);
  for (const contract of ["canonicalize_quote_item_total_v1", "quote", "subtotal", "total"]) {
    if (!source.includes(contract)) failures.push(`${quotePath}: missing ${contract}`);
  }
}

if (exists(snapshotPath)) {
  const source = read(snapshotPath);
  if (!source.includes("requireWorkspaceMember")) failures.push(`${snapshotPath}: financial snapshot must require workspace membership`);
  if (!source.includes("invoice_lines")) failures.push(`${snapshotPath}: financial snapshot must include persisted invoice lines`);
  if (!source.includes("subtotal_matches_lines")) failures.push(`${snapshotPath}: financial snapshot must expose line/header integrity evidence`);
  if (!source.includes("total_matches_header")) failures.push(`${snapshotPath}: financial snapshot must expose total integrity evidence`);
}

if (failures.length) {
  console.error("Financial authority verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Financial authority passed: persisted commercial lines own invoice/quote pricing and appointment financial snapshots expose integrity evidence.");
