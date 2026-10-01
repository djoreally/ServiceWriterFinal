/**
 * Document Intake — queries & commands for parsed expense documents.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the documents Hono router. The server owns
 * storage uploads, parsing dispatch, and approve/promote logic; this module
 * keeps the same exported signatures and shapes.
 */
import { apiClient } from "@/lib/api-client";
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

// ───────────── Queries ─────────────

export async function fetchIntakeDocuments(
  userId: string,
  filters?: { reviewStatus?: IntakeReviewStatus; profile?: IntakeProfile },
): Promise<DocumentIntakeRow[]> {
  // userId is kept for signature compatibility; the server scopes rows to
  // the authenticated user from the auth token.
  void userId;
  const response = await apiClient.get<{ data: DocumentIntakeRow[] }>(`/v1/document-intake`, {
    query: {
      review_status: filters?.reviewStatus,
      profile: filters?.profile,
    },
  });
  return response.data ?? [];
}

export async function fetchIntakeDocumentsForVehicle(
  userId: string,
  fleetVehicleId: string,
): Promise<DocumentIntakeRow[]> {
  void userId;
  const response = await apiClient.get<{ data: DocumentIntakeRow[] }>(`/v1/document-intake`, {
    query: { fleet_vehicle_id: fleetVehicleId },
  });
  return response.data ?? [];
}

export async function getIntakeFileSignedUrl(filePath: string, expiresIn = 60 * 10): Promise<string | null> {
  const response = await apiClient.get<{ data: { signedUrl: string | null } }>(
    `/v1/document-intake/signed-url`,
    { query: { file_path: filePath, expires_in: expiresIn } },
  );
  return response.data?.signedUrl ?? null;
}

// ───────────── Commands ─────────────

export interface UploadIntakeDocumentInput {
  file: File;
  profile: IntakeProfile;
  userId: string;
}

function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  });
}

export async function uploadIntakeDocument(input: UploadIntakeDocumentInput): Promise<DocumentIntakeRow> {
  const { file, profile } = input;
  const content_base64 = await fileToBase64(file);
  const response = await apiClient.post<{ data: DocumentIntakeRow }>(`/v1/document-intake/upload`, {
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    file_size_bytes: file.size,
    profile,
    content_base64,
  });
  return response.data;
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
  const response = await apiClient.post<{
    data: {
      success: boolean;
      confidence: number | null;
      vin: string | null;
      vinValid: boolean;
      fleetVehicleId: string | null;
      extracted: Record<string, unknown>;
      method: string;
    };
  }>(`/v1/document-intake/${encodeURIComponent(documentId)}/parse`);
  return response.data;
}

export async function updateIntakeProfile(documentId: string, profile: IntakeProfile): Promise<void> {
  await apiClient.patch<{ data: null }>(`/v1/document-intake/${encodeURIComponent(documentId)}`, { profile });
}

export async function updateIntakeParsedJson(documentId: string, parsed: Record<string, unknown>): Promise<void> {
  await apiClient.patch<{ data: null }>(`/v1/document-intake/${encodeURIComponent(documentId)}`, {
    parsed_json: parsed,
  });
}

export async function rejectIntakeDocument(documentId: string, reason: string): Promise<void> {
  await apiClient.patch<{ data: null }>(`/v1/document-intake/${encodeURIComponent(documentId)}`, {
    review_status: "rejected",
    rejection_reason: reason,
  });
}

export async function softDeleteIntakeDocument(documentId: string): Promise<void> {
  await apiClient.delete(`/v1/document-intake/${encodeURIComponent(documentId)}`);
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
  void userId;
  if (doc.review_status === "approved") {
    return {
      expenseId: doc.promoted_expense_id ?? undefined,
      workOrderId: doc.promoted_work_order_id ?? undefined,
      fuelLogId: doc.promoted_fuel_log_id ?? undefined,
    };
  }
  if (!doc.parsed_json) throw new Error("Document has no parsed data — parse it first.");

  const response = await apiClient.post<{
    data: { expense_id: string | null; work_order_id: string | null; fuel_log_id: string | null };
  }>(`/v1/document-intake/${encodeURIComponent(doc.id)}/approve`);
  const data = response.data;
  return {
    expenseId: data.expense_id ?? undefined,
    workOrderId: data.work_order_id ?? undefined,
    fuelLogId: data.fuel_log_id ?? undefined,
  };
}
