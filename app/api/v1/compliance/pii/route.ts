import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { z } from "zod";

const piiRequestSchema = z.object({
  customerId: z.string().uuid(),
  action: z.enum(["export", "anonymize", "delete"]),
  workspaceId: z.string().uuid(),
});

/**
 * Enterprise PII / GDPR / CCPA Data Subject Rights Endpoint
 * Handles Right-to-be-Forgotten (Anonymization/Deletion) & Data Export requests
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: { code: "unauthorized", message: "Authentication required" } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = piiRequestSchema.parse(body);

    // Verify workspace membership and required permissions
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", parsed.workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Only workspace owners or admins can perform compliance actions" } },
        { status: 403 }
      );
    }

    if (parsed.action === "export") {
      // Collect customer PII across domain tables
      const { data: customer } = await supabase.from("customers").select("*").eq("id", parsed.customerId).eq("workspace_id", parsed.workspaceId).single();
      const { data: vehicles } = await supabase.from("vehicles").select("*").eq("customer_id", parsed.customerId);
      const { data: appointments } = await supabase.from("appointments").select("*").eq("customer_id", parsed.customerId);

      return NextResponse.json({
        exportDate: new Date().toISOString(),
        customer,
        vehicles,
        appointments,
      });
    }

    if (parsed.action === "anonymize") {
      // Redact/anonymize customer PII while retaining financial and operational metadata
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          first_name: "ANONYMIZED",
          last_name: "CUSTOMER",
          email: `anonymized_${parsed.customerId.slice(0, 8)}@deleted.privacy`,
          phone: "0000000000",
          address_line1: null,
          address_line2: null,
          notes: "PII anonymized per GDPR/CCPA request",
        })
        .eq("id", parsed.customerId)
        .eq("workspace_id", parsed.workspaceId);

      if (updateError) {
        return NextResponse.json({ error: { code: "update_failed", message: updateError.message } }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "anonymize", customerId: parsed.customerId });
    }

    return NextResponse.json({ error: { code: "not_implemented", message: "Hard deletion requires secondary legal review check" } }, { status: 400 });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "invalid_request", details: err.issues } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: "internal_error", message: err.message } }, { status: 500 });
  }
}
