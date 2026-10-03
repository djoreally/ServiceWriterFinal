import { errorResponse, json } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const aliases: Readonly<Record<string,string>> = { moms: "momsoilchange", "moms-mobile-oil-change": "momsoilchange" };

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const raw = slugSchema.parse((await context.params).slug);
    const slug = aliases[raw.toLowerCase()] ?? raw;
    const body = await request.json();
    const data = await serviceWriterApi(request, `/api/v1/public/booking/${slug}/book`, {
      method: "POST",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
      body: JSON.stringify(body),
    });
    return json({ data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
