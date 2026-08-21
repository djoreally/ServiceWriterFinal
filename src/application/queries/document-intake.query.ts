/**
 * Document Intake — queries & commands for parsed expense documents.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type IntakeProfile = "service" | "fuel" | "general";
export type IntakeReviewStatus = "pending_review" | "approved" | "rejected" | "needs_info";
export type IntakeParseStatus = "pending" | "parsing" | "parsed" | "parse_failed";

export interface DocumentIntakeRow {
  id: string;
  user_id: string;
  uploaded_by_user_id: string | null;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number | null;
  profile: IntakeProfile;
  parse_status: IntakeParseStatus;
  parse_method: string | null;
  parse_error: string | null;
  parsed_json: Json | null;
  raw_text: string | null;
  confidence: number | null;
  extracted_vin: string | null;
  vin_valid: boolean | null;
  fleet_vehicle_id: string | null;
  review_status: IntakeReviewStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  promoted_expense_id: string | null;
  promoted_work_order_id: string | null;
  promoted_fuel_log_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const BUCKET = "document-intake";

// ───────────── Queries ─────────────

export async function fetchIntakeDocuments(
  userId: string,
  filters?: { reviewStatus?: IntakeReviewStatus; profile?: IntakeProfile },
): Promise<DocumentIntakeRow[]> {
  let q = supabase
    .from("document_intake")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters?.reviewStatus) q = q.eq("review_status", filters.reviewStatus);
  if (filters?.profile) q = q.eq("profile", filters.profile);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DocumentIntakeRow[];
}

export async function fetchIntakeDocumentsForVehicle(
  userId: string,
  fleetVehicleId: string,
): Promise<DocumentIntakeRow[]> {
  const { data, error } = await supabase
    .from("document_intake")
    .select("*")
    .eq("user_id", userId)
    .eq("fleet_vehicle_id", fleetVehicleId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentIntakeRow[];
}

export async function getIntakeFileSignedUrl(filePath: string, expiresIn = 60 * 10): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, expiresIn);
  return data?.signedUrl ?? null;
}

// ───────────── Commands ─────────────

export interface UploadIntakeDocumentInput {
  file: File;
  profile: IntakeProfile;
  userId: string;
}

export async function uploadIntakeDocument(input: UploadIntakeDocumentInput): Promise<DocumentIntakeRow> {
  const { file, profile, userId } = input;
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("document_intake")
    .insert([{
      user_id: userId,
      uploaded_by_user_id: userId,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      profile,
      parse_status: "pending",
      review_status: "pending_review",
    }])
    .select("*")
    .single();
  if (error) throw error;
  return data as DocumentIntakeRow;
}

export async function triggerDocumentParse(documentId: string): Promise<{
  success: boolean;
  confidence: number | null;
  vin: string | null;
  vinValid: boolean;
  fleetVehicleId: string | null;
  extracted: Record<string, unknown>;
  method: string;
}> {
  const { data, error } = await supabase.functions.invoke("expense-document-parse", {
    body: { documentId },
  });
  if (error) throw error;
  return data;
}

export async function updateIntakeProfile(documentId: string, profile: IntakeProfile): Promise<void> {
  const { error } = await supabase
    .from("document_intake")
    .update({ profile, parse_status: "pending", parsed_json: null, confidence: null })
    .eq("id", documentId);
  if (error) throw error;
}

export async function updateIntakeParsedJson(documentId: string, parsed: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from("document_intake")
    .update({ parsed_json: parsed as unknown as Json })
    .eq("id", documentId);
  if (error) throw error;
}

export async function rejectIntakeDocument(documentId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("document_intake")
    .update({
      review_status: "rejected",
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) throw error;
}

export async function softDeleteIntakeDocument(documentId: string): Promise<void> {
  const { error } = await supabase
    .from("document_intake")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw error;
}

// ───────────── Approve / Promote ─────────────

interface PromoteResult {
  expenseId?: string;
  workOrderId?: string;
  fuelLogId?: string;
}

/**
 * Approve a parsed document and create the linked downstream record.
 * Returns the IDs of the created records.
 */
export async function approveAndPromoteIntakeDocument(
  doc: DocumentIntakeRow,
  userId: string,
): Promise<PromoteResult> {
  if (doc.review_status === "approved") {
    return {
      expenseId: doc.promoted_expense_id ?? undefined,
      workOrderId: doc.promoted_work_order_id ?? undefined,
      fuelLogId: doc.promoted_fuel_log_id ?? undefined,
    };
  }
  if (!doc.parsed_json) throw new Error("Document has no parsed data — parse it first.");
  const parsed = doc.parsed_json as Record<string, unknown>;
  const result: PromoteResult = {};
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 60 * 60 * 24 * 365);
  const receiptUrl = signed?.signedUrl ?? null;

  // Resolve vendor → vendor_id + suggested category via fuzzy matcher RPC
  const rawVendorName = (doc.parsed_json as Record<string, unknown> | null)?.vendor_name as string | undefined;
  let resolvedVendorId: string | null = null;
  let resolvedCategoryId: string | null = null;
  if (rawVendorName && rawVendorName.trim().length > 0) {
    const { data: matches } = await supabase.rpc("match_vendor_by_name", {
      p_user_id: userId,
      p_raw_name: rawVendorName,
    });
    const match = Array.isArray(matches) ? matches[0] : null;
    if (match) {
      resolvedVendorId = (match as { vendor_id: string }).vendor_id ?? null;
      resolvedCategoryId = (match as { default_category_id: string | null }).default_category_id ?? null;
    }
  }

  if (doc.profile === "fuel") {
    const { data: log, error } = await supabase
      .from("fleet_fuel_logs")
      .insert([{
        user_id: userId,
        fleet_vehicle_id: doc.fleet_vehicle_id,
        fuel_date: (parsed.transaction_date as string) ?? new Date().toISOString().slice(0, 10),
        gallons: numOrNull(parsed.gallons),
        price_per_gallon: numOrNull(parsed.price_per_gallon),
        total_amount: numOrNull(parsed.total_amount) ?? 0,
        odometer: parsed.odometer ? Math.round(Number(parsed.odometer)) : null,
        fuel_type: (parsed.fuel_type as string) ?? null,
        station_name: (parsed.station_name as string) ?? null,
        station_location: (parsed.station_location as string) ?? null,
        payment_method: (parsed.payment_method as string) ?? null,
        reference_number: (parsed.reference_number as string) ?? null,
        source_document_id: doc.id,
      }])
      .select("id")
      .single();
    if (error) throw error;
    result.fuelLogId = log.id;
  } else {
    // service & general → create an expense (service additionally captures vehicle context)
    const lineItems = Array.isArray(parsed.line_items)
      ? (parsed.line_items as Array<Record<string, unknown>>).map((li) => ({
          description: String(li.description ?? ""),
          quantity: Number(li.quantity ?? 1),
          unit_price: Number(li.unit_price ?? 0),
          line_total: Number(li.line_total ?? 0),
        }))
      : [];

    const noteParts: string[] = [];
    if (doc.profile === "service") {
      if (parsed.vin) noteParts.push(`VIN: ${parsed.vin}`);
      if (parsed.mileage) noteParts.push(`Mileage: ${parsed.mileage}`);
      if (parsed.oil_type) noteParts.push(`Oil: ${parsed.oil_type}`);
      if (parsed.oil_spec) noteParts.push(`Spec: ${parsed.oil_spec}`);
    }

    const { data: exp, error: expErr } = await supabase
      .from("expenses")
      .insert([{
        user_id: userId,
        submitted_by_user_id: userId,
        vendor_id: resolvedVendorId,
        vendor_name_raw: (parsed.vendor_name as string) ?? doc.file_name,
        category_id: resolvedCategoryId,
        transaction_date: (parsed.transaction_date as string) ?? new Date().toISOString().slice(0, 10),
        subtotal: numOrZero(parsed.subtotal),
        tax_amount: numOrZero(parsed.tax_amount),
        total_amount: numOrZero(parsed.total_amount),
        payment_method: (parsed.payment_method as string) ?? null,
        last4: (parsed.last4 as string) ?? null,
        reference_number: (parsed.reference_number as string) ?? null,
        notes: noteParts.length ? noteParts.join(" • ") : null,
        receipt_url: receiptUrl,
        ocr_confidence: doc.confidence,
        ocr_raw_json: doc.parsed_json,
        status: "approved",
      }])
      .select("id")
      .single();
    if (expErr) throw expErr;
    result.expenseId = exp.id;

    if (lineItems.length > 0) {
      const rows = lineItems.map((li, idx) => ({ ...li, expense_id: exp.id, sort_order: idx }));
      const { error: liErr } = await supabase.from("expense_line_items").insert(rows);
      if (liErr) throw liErr;
    }
  }

  // Mark document approved + linked
  const { error: markErr } = await supabase
    .from("document_intake")
    .update({
      review_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      promoted_expense_id: result.expenseId ?? null,
      promoted_fuel_log_id: result.fuelLogId ?? null,
    })
    .eq("id", doc.id);
  if (markErr) throw markErr;

  return result;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function numOrZero(v: unknown): number {
  return numOrNull(v) ?? 0;
}
