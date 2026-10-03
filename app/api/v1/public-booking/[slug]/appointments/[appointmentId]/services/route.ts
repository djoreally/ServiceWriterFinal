import { errorResponse, json } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const aliases: Readonly<Record<string,string>> = { moms: "momsoilchange", "moms-mobile-oil-change": "momsoilchange" };

export async function POST(request: Request, context: { params: Promise<{ slug: string; appointmentId: string }> }) {
  try {
    const params = await context.params;
    const raw = slugSchema.parse(params.slug);
    const slug = aliases[raw.toLowerCase()] ?? raw;
    const appointmentId = z.string().uuid().parse(params.appointmentId);
    const body = await request.json();
    const data = await serviceWriterApi(request, `/api/v1/public/booking/${slug}/appointments/${appointmentId}/services`, {
      method: "POST",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
      body: JSON.stringify(body),
    });
    return json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
