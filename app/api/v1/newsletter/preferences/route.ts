import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

const tokenSchema = z.string().uuid();

function page(token: string, active: boolean) {
  const action = active ? "unsubscribe" : "subscribe";
  const button = active ? "Unsubscribe from weekly emails" : "Subscribe again";
  const state = active ? "You are subscribed to weekly email updates." : "You are unsubscribed from weekly email updates.";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head><body style="font-family:Arial,sans-serif;background:#f5f7fb;margin:0;padding:32px"><main style="max-width:560px;margin:auto;background:white;padding:28px;border-radius:14px"><h1>Email preferences</h1><p>${state}</p><form method="post"><input type="hidden" name="token" value="${token}"><input type="hidden" name="action" value="${action}"><button style="padding:12px 18px;border:0;border-radius:8px;background:#172033;color:white;font-weight:700">${button}</button></form><p style="margin-top:24px;color:#64748b;font-size:13px">Appointment confirmations and required service messages are separate from marketing email preferences.</p></main></body></html>`;
}

export async function GET(request: Request) {
  const token = tokenSchema.safeParse(new URL(request.url).searchParams.get("token"));
  if (!token.success) return new Response("Invalid preferences link", { status: 400 });
  const admin = createSupabaseAdminClient();
  const result = await admin.from("newsletter_subscribers").select("status").eq("unsubscribe_token", token.data).maybeSingle();
  if (result.error || !result.data) return new Response("Preferences link not found", { status: 404 });
  return new Response(page(token.data, result.data.status === "active"), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = tokenSchema.safeParse(form.get("token"));
  const action = form.get("action") === "subscribe" ? "subscribe" : "unsubscribe";
  if (!token.success) return new Response("Invalid preferences link", { status: 400 });
  const admin = createSupabaseAdminClient();
  const subscriber = await admin.from("newsletter_subscribers").select("id,workspace_id,email,user_id").eq("unsubscribe_token", token.data).maybeSingle();
  if (subscriber.error || !subscriber.data) return new Response("Preferences link not found", { status: 404 });

  const active = action === "subscribe";
  const update = await admin.from("newsletter_subscribers").update({
    status: active ? "active" : "unsubscribed",
    consented_at: active ? new Date().toISOString() : null,
    unsubscribed_at: active ? null : new Date().toISOString(),
    next_send_at: active ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", subscriber.data.id);
  if (update.error) return new Response("Could not update preferences", { status: 500 });

  const latestConsent = await admin.from("messaging_consents").select("id")
    .eq("workspace_id", subscriber.data.workspace_id)
    .eq("channel", "email")
    .eq("purpose", "marketing")
    .eq("contact_email", subscriber.data.email)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const values = {
    workspace_id: subscriber.data.workspace_id,
    contact_email: subscriber.data.email,
    channel: "email",
    purpose: "marketing",
    status: active ? "granted" : "revoked",
    source: "newsletter_preferences",
    legal_basis: "consent",
    consented_at: active ? new Date().toISOString() : null,
    revoked_at: active ? null : new Date().toISOString(),
    evidence: { newsletter_subscriber_id: subscriber.data.id },
  };
  if (latestConsent.data?.id) await admin.from("messaging_consents").update(values).eq("id", latestConsent.data.id);
  else await admin.from("messaging_consents").insert(values);

  return new Response(page(token.data, active), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
