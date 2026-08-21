/**
 * Fleet & Invoice Validation Layer
 *
 * Centralized validators applying the project rule:
 *   "DB + financial + linkage" = blocking; everything else = soft warning.
 *
 * Each validator returns { errors, warnings }.
 * - errors  → throw / block save
 * - warnings → surface to UI as toast.warning (do not block)
 */

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ok = (): ValidationResult => ({ errors: [], warnings: [] });

function isNonEmpty(v: unknown): boolean {
  return typeof v === "string" ? v.trim().length > 0 : v != null;
}

/* ----------------------------- Fleet Vehicle ---------------------------- */

export interface VehicleValidatable {
  fleet_client_id?: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  license_plate?: string | null;
  fleet_location_id?: string | null;
  fleet_contract_id?: string | null;
}

export function validateFleetVehicle(v: VehicleValidatable): ValidationResult {
  const r = ok();

  // BLOCKING — DB required + minimum identity
  if (!isNonEmpty(v.fleet_client_id)) {
    r.errors.push("Select a fleet client for this vehicle.");
  }
  const hasYMM = isNonEmpty(v.year) && isNonEmpty(v.make) && isNonEmpty(v.model);
  const hasVin = isNonEmpty(v.vin) && (v.vin ?? "").trim().length >= 11;
  if (!hasYMM && !hasVin) {
    r.errors.push("Provide either VIN or Year + Make + Model.");
  }
  if (isNonEmpty(v.vin) && (v.vin ?? "").trim().length !== 17) {
    r.warnings.push("VIN is not 17 characters — double-check it.");
  }

  // SOFT WARNINGS — completeness for downstream automation
  if (!isNonEmpty(v.license_plate)) r.warnings.push("No license plate set.");
  if (!isNonEmpty(v.fleet_location_id)) r.warnings.push("No home location assigned — dispatch routing will be limited.");
  if (!isNonEmpty(v.fleet_contract_id)) r.warnings.push("No contract linked — pricing will fall back to retail.");

  return r;
}

/* ---------------------------- Fleet Work Order -------------------------- */

export interface WorkOrderValidatable {
  vehicleId?: string | null;
  vehicleClientId?: string | null;      // resolved from vehicle row
  servicePackage?: { code: string } | null;
  description?: string | null;
  scheduledDate?: string | null;
  priority?: string | null;
}

export function validateFleetWorkOrder(w: WorkOrderValidatable): ValidationResult {
  const r = ok();

  // BLOCKING — DB + linkage
  if (!isNonEmpty(w.vehicleId)) {
    r.errors.push("Select a vehicle for this work order.");
  }
  if (w.vehicleId && !isNonEmpty(w.vehicleClientId)) {
    r.errors.push("Selected vehicle is not linked to a fleet client — fix the vehicle first.");
  }
  if (!w.servicePackage && !isNonEmpty(w.description)) {
    r.errors.push("Add a service package or describe the work to be performed.");
  }

  // WARNINGS
  if (!isNonEmpty(w.scheduledDate)) r.warnings.push("No scheduled date — work order will sit in backlog.");
  if (!isNonEmpty(w.priority)) r.warnings.push("Priority not set — defaulting to normal.");

  return r;
}

/* ---------------------------- Purchase Order ---------------------------- */

export interface PurchaseOrderValidatable {
  fleet_client_id?: string | null;
  po_number?: string | null;
  amount_limit?: number | null;
  expiry_date?: string | null;
  description?: string | null;
}

export function validatePurchaseOrder(p: PurchaseOrderValidatable): ValidationResult {
  const r = ok();

  // BLOCKING — DB + linkage + finance
  if (!isNonEmpty(p.fleet_client_id)) r.errors.push("Select a fleet client for this PO.");
  if (!isNonEmpty(p.po_number)) r.errors.push("PO number is required.");
  if (p.amount_limit != null && Number(p.amount_limit) < 0) {
    r.errors.push("PO amount limit cannot be negative.");
  }

  // WARNINGS
  if (p.amount_limit == null) r.warnings.push("No spending limit set — PO will accept unlimited charges.");
  if (!isNonEmpty(p.expiry_date)) r.warnings.push("No expiry date — PO will never auto-close.");
  if (!isNonEmpty(p.description)) r.warnings.push("No description — easier to audit when described.");

  return r;
}

/* -------------------------------- Invoice ------------------------------- */

export interface InvoiceLineItemValidatable {
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
}

export interface InvoiceValidatable {
  invoice_number?: string | null;
  bill_to_type?: "retail" | "fleet" | null;
  customer_id?: string | null;
  fleet_client_id?: string | null;
  due_date?: string | null;
  line_items?: InvoiceLineItemValidatable[];
  computedTotal?: number | null;
}

export function validateInvoice(i: InvoiceValidatable): ValidationResult {
  const r = ok();
  const items = i.line_items ?? [];

  // BLOCKING — DB + linkage + financial integrity
  if (!isNonEmpty(i.invoice_number)) r.errors.push("Invoice number is required.");
  if (i.bill_to_type === "retail" && !isNonEmpty(i.customer_id)) {
    r.errors.push("Retail invoices require a customer.");
  }
  if (i.bill_to_type === "fleet" && !isNonEmpty(i.fleet_client_id)) {
    r.errors.push("Fleet invoices require a fleet client.");
  }
  if (items.length === 0) {
    r.errors.push("Add at least one line item.");
  }
  items.forEach((li, idx) => {
    const qty = Number(li.quantity) || 0;
    const price = Number(li.unit_price) || 0;
    if (!isNonEmpty(li.description)) r.errors.push(`Line ${idx + 1}: description required.`);
    if (qty <= 0) r.errors.push(`Line ${idx + 1}: quantity must be greater than 0.`);
    if (price < 0) r.errors.push(`Line ${idx + 1}: unit price cannot be negative.`);
  });

  // WARNINGS
  if (!isNonEmpty(i.due_date)) r.warnings.push("No due date — aging reports will skip this invoice.");
  if (i.computedTotal != null && i.computedTotal === 0) {
    r.warnings.push("Invoice total is $0 — confirm this is intentional.");
  }

  return r;
}

/* --------------------------- Error throwing helper ---------------------- */

export class ValidationError extends Error {
  warnings: string[];
  errors: string[];
  constructor(result: ValidationResult, label = "Validation failed") {
    super(`${label}: ${result.errors.join(" ")}`);
    this.name = "ValidationError";
    this.errors = result.errors;
    this.warnings = result.warnings;
  }
}

export function assertValid(result: ValidationResult, label?: string): void {
  if (result.errors.length > 0) throw new ValidationError(result, label);
}
