import { z } from "zod";
import { errorResponse, json } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const aliases: Readonly<Record<string,string>> = { moms: "momsoilchange", "moms-mobile-oil-change": "momsoilchange" };
const bodySchema = z.object({
  appointment_id: z.string().uuid(), email: z.string().trim().email().max(320), phone: z.string().trim().max(32).nullable().optional(), transactional_sms_consent: z.boolean().optional(), marketing_sms_consent: z.boolean().optional(), marketing_email_consent: z.boolean().optional(), consent_texts: z.object({ transactional_sms: z.string().max(4000), marketing_sms: z.string().max(4000), marketing_email: z.string().max(4000) }).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const rawSlug = slugSchema.parse((await context.params).slug);
    const slug = aliases[rawSlug.toLowerCase()] ?? rawSlug;
    const body = bodySchema.parse(await request.json());
    const data = await serviceWriterApi<{ status: string; providerMessageId?: string | null }>(request, `/api/v1/public/booking/${slug}/appointments/${body.appointment_id}/confirmation`, {
      method: "POST",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
      body: JSON.stringify({
        email: body.email,
        phone: body.phone ?? null,
        transactionalSmsConsent: body.transactional_sms_consent,
        marketingSmsConsent: body.marketing_sms_consent,
        marketingEmailConsent: body.marketing_email_consent,
        consentTexts: body.consent_texts ? { transactionalSms: body.consent_texts.transactional_sms, marketingSms: body.consent_texts.marketing_sms, marketingEmail: body.consent_texts.marketing_email } : undefined,
      }),
    });
    return json({ data: { status: data.status, provider_message_id: data.providerMessageId ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: { code: "invalid_confirmation_request", message: "Invalid confirmation request" } }, { status: 400 });
    return errorResponse(error);
  }
}
