import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const GOOGLE_OAUTH_STATE_SECRET = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET") ?? "";
const GOOGLE_TOKEN_ENCRYPTION_KEY = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY") ?? "";
const GOOGLE_CALENDAR_REDIRECT_URI = Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") ?? "";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

function b64url(bytes: Uint8Array): string { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function fromB64url(value: string): Uint8Array { const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4); return Uint8Array.from(atob(normalized), c => c.charCodeAt(0)); }
async function hmac(value: string) { if (!GOOGLE_OAUTH_STATE_SECRET) throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET"); const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(GOOGLE_OAUTH_STATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))); }
async function signedState(userId: string) { const payload = b64url(new TextEncoder().encode(JSON.stringify({ sub: userId, exp: Date.now() + 10 * 60_000, nonce: crypto.randomUUID() }))); return `${payload}.${await hmac(payload)}`; }
async function verifyState(state: string, userId: string) { const [payload, signature] = state.split("."); if (!payload || !signature || await hmac(payload) !== signature) return false; const decoded = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { sub?: string; exp?: number }; return decoded.sub === userId && typeof decoded.exp === "number" && decoded.exp > Date.now(); }
async function encryptionKey() { if (!GOOGLE_TOKEN_ENCRYPTION_KEY) throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY"); const raw = fromB64url(GOOGLE_TOKEN_ENCRYPTION_KEY); if (raw.byteLength !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key"); return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
async function encrypt(value: string | null | undefined) { if (!value) return null; const iv = crypto.getRandomValues(new Uint8Array(12)); const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value))); const combined = new Uint8Array(iv.length + cipher.length); combined.set(iv); combined.set(cipher, iv.length); return b64url(combined); }
async function decrypt(value: string | null | undefined) { if (!value) return null; const combined = fromB64url(value); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, await encryptionKey(), combined.slice(12)); return new TextDecoder().decode(plain); }
async function authenticatedUser(request: Request) { const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim(); if (!token) throw new Error("Not authenticated"); const { data, error } = await admin.auth.getUser(token); if (error || !data.user) throw new Error("Not authenticated"); return data.user; }
async function googleToken(body: Record<string, string>) { const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, ...body }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error_description || data.error || "Google token exchange failed"); return data as { access_token: string; refresh_token?: string; expires_in: number }; }
async function saveConnection(userId: string, token: { access_token?: string; refresh_token?: string; expires_in?: number }, calendarId = "primary") { const existing = await admin.from("google_calendar_sync_tokens").select("refresh_token_encrypted").eq("user_id", userId).maybeSingle(); if (existing.error) throw existing.error; const { error } = await admin.from("google_calendar_sync_tokens").upsert({ user_id: userId, calendar_id: calendarId, access_token_encrypted: token.access_token ? await encrypt(token.access_token) : null, refresh_token_encrypted: token.refresh_token ? await encrypt(token.refresh_token) : existing.data?.refresh_token_encrypted ?? null, token_expires_at: new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000).toISOString(), sync_enabled: true, needs_reauth: false, last_sync_error: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" }); if (error) throw error; }
async function accessTokenFor(userId: string) { const { data, error } = await admin.from("google_calendar_sync_tokens").select("*").eq("user_id", userId).maybeSingle(); if (error) throw error; if (!data || !data.sync_enabled) return null; const expiresAt = Date.parse(data.token_expires_at || ""); if (data.access_token_encrypted && expiresAt > Date.now() + 60_000) return { token: await decrypt(data.access_token_encrypted), calendarId: data.calendar_id as string }; const refresh = await decrypt(data.refresh_token_encrypted); if (!refresh) return null; try { const refreshed = await googleToken({ grant_type: "refresh_token", refresh_token: refresh }); await saveConnection(userId, refreshed, data.calendar_id); return { token: refreshed.access_token, calendarId: data.calendar_id as string }; } catch (error) { await admin.from("google_calendar_sync_tokens").update({ needs_reauth: true, sync_enabled: false, last_sync_error: String(error), updated_at: new Date().toISOString() }).eq("user_id", userId); throw error; } }
async function googleApi(userId: string, path: string, init: RequestInit = {}) { const connection = await accessTokenFor(userId); if (!connection?.token) throw new Error("Google Calendar is not connected"); const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { authorization: `Bearer ${connection.token}`, "content-type": "application/json", ...(init.headers ?? {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || `Google Calendar API request failed (${response.status})`); return { data, calendarId: connection.calendarId }; }

async function workspaceIdsFor(userId: string) { const { data, error } = await admin.from("workspace_members").select("workspace_id").eq("user_id", userId).eq("is_active", true); if (error) throw error; return (data ?? []).map(row => String(row.workspace_id)); }
async function loadAppointment(userId: string, appointmentId: string) {
  const workspaceIds = await workspaceIdsFor(userId);
  if (!workspaceIds.length) throw new Error("No active workspace membership");
  const { data, error } = await admin.from("appointments")
    .select("id,workspace_id,customer_id,vehicle_id,status,starts_at,ends_at,notes,metadata,customers(first_name,last_name,email,phone),vehicles(year,make,model,license_plate)")
    .eq("id", appointmentId).in("workspace_id", workspaceIds).maybeSingle();
  if (error) throw error; if (!data) throw new Error("Appointment not found in an authorized workspace");
  const { data: workspace, error: workspaceError } = await admin.from("workspaces").select("name,timezone").eq("id", data.workspace_id).single();
  if (workspaceError) throw workspaceError;
  return { ...data, workspace } as Record<string, any>;
}
function relation(value: unknown) { return Array.isArray(value) ? value[0] : value; }
function eventFromAppointment(appointment: Record<string, any>) {
  const start = String(appointment.starts_at ?? appointment.start_time ?? appointment.scheduled_start ?? appointment.start_at ?? "");
  const end = String(appointment.ends_at ?? appointment.end_time ?? appointment.scheduled_end ?? appointment.end_at ?? "");
  if (!start || !end) throw new Error("Appointment starts_at and ends_at are required for calendar sync");
  const metadata = appointment.metadata && typeof appointment.metadata === "object" ? appointment.metadata : {};
  const customer = relation(appointment.customers) as Record<string, any> | undefined;
  const vehicle = relation(appointment.vehicles) as Record<string, any> | undefined;
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
  const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
  const summary = String(metadata.title || [customerName, vehicleName].filter(Boolean).join(" — ") || "Service appointment");
  const description = [metadata.description, appointment.notes, customer?.phone ? `Phone: ${customer.phone}` : null, customer?.email ? `Email: ${customer.email}` : null].filter(Boolean).join("\n\n");
  return { summary, description, location: String(metadata.location_address || metadata.address || ""), start: { dateTime: start, timeZone: String(appointment.workspace?.timezone || "America/New_York") }, end: { dateTime: end, timeZone: String(appointment.workspace?.timezone || "America/New_York") }, extendedProperties: { private: { servicewriter_appointment_id: String(appointment.id), servicewriter_workspace_id: String(appointment.workspace_id) } } };
}
async function syncAppointment(userId: string, appointmentId: string) {
  if (!appointmentId) throw new Error("Appointment id is required");
  const appointment = await loadAppointment(userId, appointmentId);
  const connection = await accessTokenFor(userId); if (!connection) throw new Error("Google Calendar is not connected");
  const { data: existing, error: mappingError } = await admin.from("appointment_calendar_events").select("google_event_id,calendar_id").eq("user_id", userId).eq("appointment_id", appointmentId).maybeSingle(); if (mappingError) throw mappingError;
  if (["cancelled", "no_show"].includes(String(appointment.status)) && existing?.google_event_id) {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(existing.google_event_id)}`, { method: "DELETE", headers: { authorization: `Bearer ${connection.token}` } });
    if (!response.ok && response.status !== 404 && response.status !== 410) { const data = await response.json().catch(() => ({})); throw new Error(data.error?.message || "Unable to remove cancelled appointment from Google Calendar"); }
    await admin.from("appointment_calendar_events").delete().eq("user_id", userId).eq("appointment_id", appointmentId);
    return { synced: true, action: "deleted", google_event_id: existing.google_event_id };
  }
  const event = eventFromAppointment(appointment);
  let result; let action: "created" | "updated";
  if (existing?.google_event_id) { result = await googleApi(userId, `calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(existing.google_event_id)}`, { method: "PUT", body: JSON.stringify(event) }); action = "updated"; }
  else { result = await googleApi(userId, `calendars/${encodeURIComponent(connection.calendarId)}/events`, { method: "POST", body: JSON.stringify(event) }); action = "created"; }
  const { error: upsertError } = await admin.from("appointment_calendar_events").upsert({ user_id: userId, appointment_id: appointmentId, calendar_id: connection.calendarId, google_event_id: result.data.id, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id,appointment_id" }); if (upsertError) throw upsertError;
  await admin.from("google_calendar_sync_tokens").update({ last_sync_at: new Date().toISOString(), last_sync_error: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
  return { synced: true, action, google_event_id: result.data.id };
}
async function backfill(userId: string) {
  const workspaceIds = await workspaceIdsFor(userId); if (!workspaceIds.length) return { pushed: 0, repaired: 0, failed: 0 };
  const { data, error } = await admin.from("appointments").select("id").in("workspace_id", workspaceIds).gte("starts_at", new Date().toISOString()).not("status", "in", "(cancelled,no_show)").order("starts_at", { ascending: true }).limit(200); if (error) throw error;
  let pushed = 0, repaired = 0, failed = 0;
  for (const row of data ?? []) { try { const result = await syncAppointment(userId, String(row.id)); if (result.action === "created") pushed++; else repaired++; } catch (error) { failed++; await admin.from("google_calendar_sync_tokens").update({ last_sync_error: String(error), updated_at: new Date().toISOString() }).eq("user_id", userId); } }
  return { pushed, repaired, failed };
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
  const user = await authenticatedUser(request); const body = await request.json().catch(() => ({})) as Record<string, unknown>; const mode = String(body.mode ?? "status");
  if (["oauth_start", "oauth_callback"].includes(mode) && (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALENDAR_REDIRECT_URI)) throw new Error("Google Calendar OAuth is not configured");
  if (mode === "oauth_start") { const redirectUri = String(body.redirect_uri ?? ""); if (redirectUri !== GOOGLE_CALENDAR_REDIRECT_URI) throw new Error("Invalid Google Calendar redirect URI"); const state = await signedState(user.id); const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: GOOGLE_CALENDAR_SCOPE, state }); return json({ authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }); }
  if (mode === "oauth_callback") { const redirectUri = String(body.redirect_uri ?? ""), state = String(body.state ?? ""); if (redirectUri !== GOOGLE_CALENDAR_REDIRECT_URI || !(await verifyState(state, user.id))) throw new Error("Invalid Google OAuth state or redirect URI"); const token = await googleToken({ code: String(body.code ?? ""), grant_type: "authorization_code", redirect_uri: redirectUri }); await saveConnection(user.id, token); return json({ connected: true, backfill: await backfill(user.id) }); }
  if (mode === "exchange_token") { const providerToken = String(body.provider_token ?? ""); if (!providerToken) throw new Error("Google provider token missing"); await saveConnection(user.id, { access_token: providerToken, refresh_token: body.provider_refresh_token ? String(body.provider_refresh_token) : undefined, expires_in: 3600 }); return json({ connected: true }); }
  if (mode === "status") { const { data, error } = await admin.from("google_calendar_sync_tokens").select("calendar_id,sync_enabled,needs_reauth,last_sync_at,last_sync_error,created_at").eq("user_id", user.id).maybeSingle(); if (error) throw error; return json({ connected: Boolean(data), ...data, connected_at: data?.created_at ?? null }); }
  if (mode === "disconnect") { await admin.from("appointment_calendar_events").delete().eq("user_id", user.id); const { error } = await admin.from("google_calendar_sync_tokens").delete().eq("user_id", user.id); if (error) throw error; return json({ disconnected: true }); }
  if (mode === "sync_appointment") { const provided = body.appointment as Record<string, unknown> | undefined; const appointmentId = String(body.appointment_id ?? provided?.id ?? ""); return json(await syncAppointment(user.id, appointmentId)); }
  if (mode === "backfill") return json({ backfill: await backfill(user.id) });
  throw new Error(`Unsupported mode: ${mode}`);
}

Deno.serve(async (request) => { try { return await handle(request); } catch (error) { return json({ error: error instanceof Error ? error.message : "Google Calendar request failed" }, 400); } });
