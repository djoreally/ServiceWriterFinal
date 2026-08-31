import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { errorResponse, json } from "@/server/api";
import { sendBookingConfirmation } from "@/server/messaging/booking-confirmation";

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const bodySchema = z.object({
  appointment_id: z.string().uuid(),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(32).nullable().optional(),
  transactional_sms_consent: z.boolean().optional(),
  marketing_sms_consent: z.boolean().optional(),
  marketing_email_consent: z.boolean().optional(),
  consent_texts: z.object({
    transactional_sms: z.string().max(4000),
    marketing_sms: z.string().max(4000),
    marketing_email: z.string().max(4000),
  }).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const slug = slugSchema.parse((await context.params).slug);
    const body = bodySchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    // Resolve the exact workspace from the canonical booking slug. Booking
    // creation uses this same workspace_settings mapping; selecting an owner's
    // first workspace here breaks confirmation for multi-workspace owners.
    const bookingSettingsResult = await admin.from("workspace_settings")
      .select("workspace_id")
      .eq("booking_slug", slug)
      .eq("booking_enabled", true)
      .limit(1)
      .single();
    if (bookingSettingsResult.error || !bookingSettingsResult.data?.workspace_id) {
      return json({ error: { code: "booking_unavailable", message: "Booking provider unavailable" } }, { status: 404 });
    }

    const workspaceResult = await admin.from("workspaces")
      .select("id,name,timezone")
      .eq("id", bookingSettingsResult.data.workspace_id)
      .eq("is_active", true)
      .single();
    if (workspaceResult.error || !workspaceResult.data) {
      return json({ error: { code: "booking_unavailable", message: "Booking provider unavailable" } }, { status: 404 });
    }

    const appointmentResult = await admin.from("appointments")
      .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,created_at")
      .eq("id", body.appointment_id)
      .eq("workspace_id", workspaceResult.data.id)
      .single();
    const appointment = appointmentResult.data;
    const boundEmail = String((appointment?.metadata as Record<string, unknown> | null)?.guest_email || "").toLowerCase();
    if (appointmentResult.error || !appointment || boundEmail !== body.email.toLowerCase()) {
      return json({ error: { code: "confirmation_not_found", message: "Booking confirmation not found" } }, { status: 404 });
    }

    const consentRows = [
      { channel: "sms", purpose: "transactional", granted: body.transactional_sms_consent, text: body.consent_texts?.transactional_sms },
      { channel: "sms", purpose: "marketing", granted: body.marketing_sms_consent, text: body.consent_texts?.marketing_sms },
      { channel: "email", purpose: "marketing", granted: body.marketing_email_consent, text: body.consent_texts?.marketing_email },
    ].filter((consent): consent is typeof consent & { granted: boolean } => typeof consent.granted === "boolean");
    for (const consent of consentRows) {
      const evidence = { appointment_id: appointment.id, consent_text: consent.text || null };
      const existing = await admin.from("messaging_consents")
        .select("id")
        .eq("workspace_id", appointment.workspace_id)
        .eq("channel", consent.channel)
        .eq("purpose", consent.purpose)
        .contains("evidence", { appointment_id: appointment.id })
        .maybeSingle();
      const values = {
        workspace_id: appointment.workspace_id,
        customer_id: appointment.customer_id,
        contact_email: body.email.toLowerCase(),
        contact_phone: body.phone || null,
        channel: consent.channel,
        purpose: consent.purpose,
        status: consent.granted ? "granted" : "revoked",
        source: "checkout",
        legal_basis: consent.purpose === "transactional" ? "contract" : "consent",
        consented_at: consent.granted ? new Date().toISOString() : null,
        revoked_at: consent.granted ? null : new Date().toISOString(),
        evidence,
      };
      const consentResult = existing.data?.id
        ? await admin.from("messaging_consents").update(values).eq("id", existing.data.id)
        : await admin.from("messaging_consents").insert(values);
      if (consentResult.error) throw consentResult.error;
    }

    const result = await sendBookingConfirmation({
      appointment,
      workspaceName: workspaceResult.data.name,
      workspaceTimezone: workspaceResult.data.timezone,
      recipientEmail: body.email.toLowerCase(),
      actionUrl: new URL(`/booking/${slug}/confirmation?appointment_id=${appointment.id}`, request.url).toString(),
    });
    return json({ data: { status: result.status, provider_message_id: result.providerMessageId } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: { code: "invalid_confirmation_request", message: "Invalid confirmation request" } }, { status: 400 });
    return errorResponse(error);
  }
}
