import { z } from "zod";

const uuid = z.string().uuid();
const rowSchema = z.record(z.string(), z.unknown());

export const accountExportSchema = z.object({
  exportDate: z.string().min(1),
  userId: uuid,
  email: z.string().email(),
  exportVersion: z.string().min(1),
  data: z.record(z.string(), z.array(rowSchema)),
}).passthrough();

export type AccountExport = z.infer<typeof accountExportSchema>;
export type ImportSeverity = "error" | "warning" | "info";
export type ImportIssue = { code: string; severity: ImportSeverity; message: string; section?: string; row?: number; field?: string };
export type ImportSectionSummary = { section: string; sourceRows: number; acceptedRows: number; errors: number; warnings: number; status: "ready" | "review" | "unsupported" | "empty" };
export type AccountImportPlan = {
  sourceUserId: string;
  sourceEmail: string;
  exportVersion: string;
  exportDate: string;
  targetWorkspaceId: string;
  sections: ImportSectionSummary[];
  issues: ImportIssue[];
  totals: { sourceRows: number; acceptedRows: number; errors: number; warnings: number };
  importOrder: string[];
};

const supportedSections = new Set([
  "business_profiles", "customers", "vehicles", "service_catalog", "appointments", "services",
  "appointment_services", "invoices", "invoice_line_items", "payment_records", "expenses",
  "technicians", "audit_logs", "user_roles",
]);
const importOrder = [
  "business_profiles", "customers", "vehicles", "service_catalog", "technicians", "appointments",
  "services", "appointment_services", "invoices", "invoice_line_items", "payment_records", "expenses",
  "audit_logs",
];

function issue(issues: ImportIssue[], item: ImportIssue) { issues.push(item); }
function hasValue(row: Record<string, unknown>, key: string) { return typeof row[key] === "string" && row[key].trim().length > 0; }

export function parseAccountExport(input: unknown): { exportData?: AccountExport; issues: ImportIssue[] } {
  const parsed = accountExportSchema.safeParse(input);
  if (parsed.success) return { exportData: parsed.data, issues: [] };
  return {
    issues: parsed.error.issues.map((item) => ({ code: "invalid_export", severity: "error", message: item.message, field: item.path.join(".") })),
  };
}

export function planAccountImport(input: AccountExport, targetWorkspaceId: string): AccountImportPlan {
  const issues: ImportIssue[] = [];
  const sections: ImportSectionSummary[] = [];
  let sourceRows = 0;
  let acceptedRows = 0;
  let errors = 0;
  let warnings = 0;

  if (!uuid.safeParse(targetWorkspaceId).success) issue(issues, { code: "invalid_workspace", severity: "error", message: "Select a valid destination workspace before importing." });
  if (!input.data.business_profiles?.length) issue(issues, { code: "missing_business_profile", severity: "warning", message: "The export has no business profile; workspace settings will not be inferred." });

  for (const [section, rows] of Object.entries(input.data)) {
    sourceRows += rows.length;
    if (!supportedSections.has(section)) {
      sections.push({ section, sourceRows: rows.length, acceptedRows: 0, errors: 0, warnings: rows.length ? 0 : 0, status: rows.length ? "unsupported" : "empty" });
      if (rows.length) issue(issues, { code: "unsupported_section", severity: "warning", message: `${section} is present but requires explicit target mapping and will not be imported automatically.`, section });
      continue;
    }
    if (!rows.length) {
      sections.push({ section, sourceRows: 0, acceptedRows: 0, errors: 0, warnings: 0, status: "empty" });
      continue;
    }
    let sectionErrors = 0;
    let sectionWarnings = 0;
    for (const [index, row] of rows.entries()) {
      if (!hasValue(row, "id")) { sectionErrors += 1; issue(issues, { code: "missing_source_id", severity: "error", message: "Every imported row must have a stable source id.", section, row: index + 1, field: "id" }); }
      if ("user_id" in row && !hasValue(row, "user_id")) { sectionWarnings += 1; issue(issues, { code: "empty_user_id", severity: "warning", message: "The source user_id is empty; destination identity mapping is required.", section, row: index + 1, field: "user_id" }); }
      if (["customers", "vehicles", "appointments", "services", "invoices", "payment_records"].includes(section) && !hasValue(row, "workspace_id")) {
        sectionWarnings += 1;
        issue(issues, { code: "missing_workspace_id", severity: "warning", message: "This source row has no workspace_id; it will inherit the selected destination workspace only after preview approval.", section, row: index + 1, field: "workspace_id" });
      }
      if (["customers", "technicians"].includes(section) && !hasValue(row, "email") && !hasValue(row, "phone")) {
        sectionWarnings += 1;
        issue(issues, { code: "missing_contact", severity: "warning", message: "No email or phone is available for matching this record.", section, row: index + 1 });
      }
    }
    const accepted = rows.length - sectionErrors;
    sourceRows += 0;
    acceptedRows += accepted;
    errors += sectionErrors;
    warnings += sectionWarnings;
    sections.push({ section, sourceRows: rows.length, acceptedRows: accepted, errors: sectionErrors, warnings: sectionWarnings, status: sectionErrors ? "review" : sectionWarnings ? "review" : "ready" });
  }

  const duplicateKeys = new Map<string, number>();
  for (const row of input.data.customers ?? []) {
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    if (!email) continue;
    duplicateKeys.set(email, (duplicateKeys.get(email) ?? 0) + 1);
  }
  for (const [email, count] of duplicateKeys) if (count > 1) {
    warnings += 1;
    issue(issues, { code: "duplicate_customer_email", severity: "warning", message: `${count} customer rows share the same normalized email; review before merging.`, section: "customers", field: email });
  }

  return {
    sourceUserId: input.userId,
    sourceEmail: input.email,
    exportVersion: input.exportVersion,
    exportDate: input.exportDate,
    targetWorkspaceId,
    sections,
    issues,
    totals: { sourceRows, acceptedRows, errors, warnings },
    importOrder,
  };
}

export function canCommitAccountImport(plan: AccountImportPlan): boolean {
  return Boolean(plan.targetWorkspaceId) && plan.totals.errors === 0 && !plan.issues.some((item) => item.code === "invalid_workspace" && item.severity === "error");
}

export function summarizeAccountExport(input: AccountExport) {
  return Object.entries(input.data).map(([section, rows]) => ({ section, count: rows.length })).sort((a, b) => b.count - a.count);
}
