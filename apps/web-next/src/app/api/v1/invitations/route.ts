import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { errorResponse, json, paginationSchema, requireWorkspaceMember } from "@/server/api";

const invitationRole = z.enum(["owner", "admin", "manager", "service_advisor", "technician", "dispatcher", "receptionist", "fleet_manager", "viewer", "customer"]);
const createInvitationSchema = z.object({
  workspace_id: z.string().uuid(),
  invited_email: z.string().trim().toLowerCase().email(),
  invited_role: invitationRole,
  customer_id: z.string().uuid().optional(),
  expires_in_days: z.coerce.number().int().min(1).max(30).default(7),
});

const invitationSelect = "id,workspace_id,customer_id,invited_email,invited_role,expires_at,accepted_at,accepted_by,revoked_at,created_by,created_at,updated_at";
const digest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) return json({ error: { code: "missing_workspace", message: "workspace_id is required" } }, { status: 400 });
    const { supabase } = await requireWorkspaceMember(workspaceId, ["owner", "admin"]);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("invitations")
      .select(invitationSelect)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createInvitationSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin"]);
    if (body.invited_role === "customer" && !body.customer_id) {
      return json({ error: { code: "customer_required", message: "customer_id is required for customer invitations" } }, { status: 400 });
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString();
    const { expires_in_days: _expiresInDays, ...input } = body;
    const { data, error } = await supabase
      .from("invitations")
      .insert({ ...input, token_hash: digest(token), expires_at: expiresAt, created_by: user.id })
      .select(invitationSelect)
      .single();
    if (error) throw error;
    const { error: eventError } = await supabase.from("invitation_events").insert({
      invitation_id: data.id,
      workspace_id: data.workspace_id,
      event_type: "created",
      actor_user_id: user.id,
      metadata: { invited_role: data.invited_role },
    });
    if (eventError) throw eventError;
    return json({ data, token }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
