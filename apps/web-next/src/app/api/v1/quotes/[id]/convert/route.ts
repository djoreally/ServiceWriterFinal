import { z } from "zod";
import { ApiError, errorResponse, json, requireWorkspaceMember } from "@/server/api";

const conversionRequestSchema = z.object({
  workspace_id: z.string().uuid(),
  idempotency_key: z.string().trim().min(16).max(200),
  service_date: z.string().date().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  internal_notes: z.string().trim().max(10000).nullable().optional(),
  expected_quote_updated_at: z.string().datetime().nullable().optional(),
}).strict();

const quoteIdSchema = z.string().uuid();

const errorMap: Record<string, { status: number; code: string }> = {
  quote_conversion_forbidden: { status: 403, code: "forbidden" },
  quote_not_found: { status: 404, code: "quote_not_found" },
  quote_already_converted: { status: 409, code: "quote_already_converted" },
  quote_status_not_convertible: { status: 409, code: "quote_status_not_convertible" },
  quote_changed_refresh_required: { status: 409, code: "quote_changed_refresh_required" },
};

function normalizeConversionError(error: unknown): never {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "quote_conversion_failed";
  const normalized = errorMap[message];
  if (normalized) throw new ApiError(normalized.status, message.replaceAll("_", " "), normalized.code);
  throw error;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const quoteId = quoteIdSchema.parse((await context.params).id);
    const body = conversionRequestSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor"]);
    const { data, error } = await supabase.rpc("convert_quote_to_service_record_v1", {
      p_workspace_id: body.workspace_id,
      p_quote_id: quoteId,
      p_idempotency_key: body.idempotency_key,
      p_created_by: user.id,
      p_service_date: body.service_date ?? null,
      p_technician_id: body.technician_id ?? null,
      p_appointment_id: body.appointment_id ?? null,
      p_work_order_id: body.work_order_id ?? null,
      p_internal_notes: body.internal_notes ?? null,
      p_expected_quote_updated_at: body.expected_quote_updated_at ?? null,
    });
    if (error) normalizeConversionError(error);
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
