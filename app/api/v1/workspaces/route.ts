import { corsHeaders, errorResponse, json } from "@/server/api";
import { serviceWriterApi } from "@/server/service-writer-api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  try {
    const rows = await serviceWriterApi<Array<{
      id: string;
      name: string;
      slug: string;
      timezone: string;
      currencyCode: string;
      isActive: boolean;
      role: string;
    }>>(request, "/api/v1/workspaces");

    const data = rows.map((row) => ({
      workspace_id: row.id,
      role: row.role,
      is_active: row.isActive,
      workspaces: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        timezone: row.timezone,
        currency_code: row.currencyCode,
        is_active: row.isActive,
      },
    }));

    return json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
