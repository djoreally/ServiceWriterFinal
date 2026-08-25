import { json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const schema = z.object({
  workspace_id: z.string().uuid(),
  item_id: z.string().uuid(),
  evidence_url: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

/**
 * Final intentionally does not carry the retired work_order_checklist_items /
 * advance_checklist_step implementation. Keep the API route explicit rather
 * than issuing queries against objects that do not exist.
 */
export async function POST(request: Request) {
  const body = schema.parse(await request.json());
  await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);
  return json({
    error: {
      code: "checklist_not_configured",
      message: "Work-order checklist workflow has not been rebuilt on Final yet.",
    },
  }, { status: 501 });
}
