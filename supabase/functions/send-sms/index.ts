import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TELNYX_API_KEY = Deno.env.get("TELNYX_API_KEY") ?? "";
const TELNYX_MESSAGING_PROFILE_ID = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") ?? "";
const TELNYX_FROM_NUMBER = Deno.env.get("TELNYX_FROM_NUMBER") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const responseJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

async function requireUser(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Not authenticated");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user;
}

async function optedOut(phone: string, workspaceId: string | null) {
  if (!workspaceId) return false;
  const { data } = await supabase.from("messaging_suppressions").select("id").eq("workspace_id", workspaceId).eq("channel", "sms").eq("destination", phone).maybeSingle();
  return Boolean(data);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return responseJson({ error: "Method Not Allowed" }, 405);
  try {
    const user = await requireUser(request);
    const body = await request.json() as { to?: string; message?: string; appointmentId?: string | null; customerId?: string | null; workspaceId?: string | null; messageClass?: string; messageType?: string; };
    const to = String(body.to ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!/^\+?[1-9]\d{6,14}$/.test(to.replace(/[\s().-]/g, ""))) throw new Error("A valid destination phone number is required");
    if (!message || message.length > 1600) throw new Error("Message must contain 1-1600 characters");
    if (!TELNYX_API_KEY || (!TELNYX_MESSAGING_PROFILE_ID && !TELNYX_FROM_NUMBER)) throw new Error("Telnyx SMS is not configured");
    if (await optedOut(to, body.workspaceId ?? null)) return responseJson({ sent: false, reason: "opted_out" });

    const payload: Record<string, string> = { to, text: message };
    if (TELNYX_MESSAGING_PROFILE_ID) payload.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;
    else payload.from = TELNYX_FROM_NUMBER;
    const telnyx = await fetch("https://api.telnyx.com/v2/messages", { method: "POST", headers: { authorization: `Bearer ${TELNYX_API_KEY}`, "content-type": "application/json", "idempotency-key": `${body.appointmentId ?? "manual"}:${body.messageType ?? "message"}:${crypto.randomUUID()}` }, body: JSON.stringify(payload) });
    const result = await telnyx.json().catch(() => ({}));
    if (!telnyx.ok || !result.data?.id) throw new Error(result.errors?.[0]?.detail ?? `Telnyx request failed with ${telnyx.status}`);
    return responseJson({ sent: true, providerMessageId: result.data.id, segments: Math.max(1, Math.ceil(message.length / 160)), userId: user.id });
  } catch (error) {
    return responseJson({ sent: false, details: error instanceof Error ? error.message : "SMS request failed" }, 400);
  }
});
