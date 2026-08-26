import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const GOOGLE_OAUTH_STATE_SECRET = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET") ?? "";
const GOOGLE_TOKEN_ENCRYPTION_KEY = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY") ?? "";
const GOOGLE_CALENDAR_REDIRECT_URI = Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") ?? "";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" },
  });

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesFromB64url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value: string): Promise<string> {
  if (!GOOGLE_OAUTH_STATE_SECRET) throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(GOOGLE_OAUTH_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function signedState(userId: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ sub: userId, exp: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID() })));
  return `${payload}.${await hmac(payload)}`;
}

async function verifyState(state: string, userId: string): Promise<boolean> {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !GOOGLE_OAUTH_STATE_SECRET) return false;
  const expected = await hmac(payload);
  if (expected !== signature) return false;
  const decoded = JSON.parse(new TextDecoder().decode(bytesFromB64url(payload))) as { sub?: string; exp?: number };
  return decoded.sub === userId && typeof decoded.exp === "number" && decoded.exp > Date.now();
}

async function encryptionKey(): Promise<CryptoKey> {
  if (!GOOGLE_TOKEN_ENCRYPTION_KEY) throw new Error("Missing GOOGLE_TOKEN_ENCRYPTION_KEY");
  const raw = bytesFromB64url(GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value)));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return b64url(combined);
}

async function decrypt(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const combined = bytesFromB64url(value);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, await encryptionKey(), combined.slice(12));
  return new TextDecoder().decode(plaintext);
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) throw new Error("Not authenticated");
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user;
}

async function googleToken(body: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, ...body }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Google token exchange failed");
  return data as { access_token: string; refresh_token?: string; expires_in: number; token_type: string };
}

async function saveConnection(userId: string, token: { access_token?: string; refresh_token?: string; expires_in?: number }, calendarId = "primary") {
  const existing = await admin.from("google_calendar_sync_tokens").select("refresh_token_encrypted").eq("user_id", userId).maybeSingle();
  if (existing.error) throw existing.error;
  const refreshToken = token.refresh_token ? await encrypt(token.refresh_token) : existing.data?.refresh_token_encrypted ?? null;
  const accessToken = token.access_token ? await encrypt(token.access_token) : null;
  const { error } = await admin.from("google_calendar_sync_tokens").upsert({
    user_id: userId,
    calendar_id: calendarId,
    access_token_encrypted: accessToken,
    refresh_token_encrypted: refreshToken,
    token_expires_at: new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000).toISOString(),
    sync_enabled: true,
    needs_reauth: false,
    last_sync_error: null,
  }, { onConflict: "user_id" });
  if (error) throw error;
}

async function accessTokenFor(userId: string) {
  const { data, error } = await admin.from("google_calendar_sync_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data || !data.sync_enabled) return null;
  const refreshToken = await decrypt(data.refresh_token_encrypted);
  const expiresAt = Date.parse(data.token_expires_at);
  if (data.access_token_encrypted && expiresAt > Date.now() + 60_000) {
    return { token: await decrypt(data.access_token_encrypted), calendarId: data.calendar_id as string };
  }
  if (!refreshToken) return null;
  try {
    const refreshed = await googleToken({ grant_type: "refresh_token", refresh_token: refreshToken });
    await saveConnection(userId, { access_token: refreshed.access_token, expires_in: refreshed.expires_in }, data.calendar_id);
    return { token: refreshed.access_token, calendarId: data.calendar_id as string };
  } catch (error) {
    await admin.from("google_calendar_sync_tokens").update({ needs_reauth: true, sync_enabled: false, last_sync_error: String(error) }).eq("user_id", userId);
    throw error;
  }
}

async function googleApi(userId: string, path: string, init: RequestInit = {}) {
  const connection = await accessTokenFor(userId);
  if (!connection?.token) throw new Error("Google Calendar is not connected");
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${connection.token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Google Calendar API request failed");
  return { data, calendarId: connection.calendarId };
}

function eventFromAppointment(appointment: Record<string, unknown>) {
  const start = String(appointment.start_time ?? appointment.scheduled_start ?? appointment.start_at ?? appointment.appointment_date ?? "");
  const end = String(appointment.end_time ?? appointment.scheduled_end ?? appointment.end_at ?? "");
  if (!start || !end) throw new Error("Appointment start and end times are required for calendar sync");
  return {
    summary: String(appointment.title ?? appointment.service_name ?? appointment.service ?? "Service appointment"),
    description: String(appointment.description ?? appointment.notes ?? ""),
    location: String(appointment.location ?? appointment.address ?? ""),
    start: { dateTime: start, timeZone: String(appointment.timezone ?? "America/New_York") },
    end: { dateTime: end, timeZone: String(appointment.timezone ?? "America/New_York") },
    extendedProperties: { private: { servicewriter_appointment_id: String(appointment.id ?? "") } },
  };
}

async function syncAppointment(userId: string, appointment: Record<string, unknown>) {
  const appointmentId = String(appointment.id ?? "");
  if (!appointmentId) throw new Error("Appointment id is required");
  const connection = await accessTokenFor(userId);
  if (!connection) throw new Error("Google Calendar is not connected");
  const existing = await admin.from("appointment_calendar_events").select("google_event_id, calendar_id").eq("user_id", userId).eq("appointment_id", appointmentId).maybeSingle();
  if (existing.error) throw existing.error;
  const event = eventFromAppointment(appointment);
  let result;
  if (existing.data?.google_event_id) {
    result = await googleApi(userId, `calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(existing.data.google_event_id)}`, { method: "PUT", body: JSON.stringify(event) });
  } else {
    result = await googleApi(userId, `calendars/${encodeURIComponent(connection.calendarId)}/events`, { method: "POST", body: JSON.stringify(event) });
    const { error } = await admin.from("appointment_calendar_events").upsert({ user_id: userId, appointment_id: appointmentId, calendar_id: connection.calendarId, google_event_id: result.data.id, synced_at: new Date().toISOString() }, { onConflict: "user_id,appointment_id" });
    if (error) throw error;
  }
  await admin.from("google_calendar_sync_tokens").update({ last_sync_at: new Date().toISOString(), last_sync_error: null }).eq("user_id", userId);
  return { synced: true, google_event_id: result.data.id };
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" } });
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
  const user = await authenticatedUser(request);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const mode = String(body.mode ?? "status");
  if (["oauth_start", "oauth_callback"].includes(mode) && (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALENDAR_REDIRECT_URI)) {
    throw new Error("Google Calendar OAuth is not configured");
  }
  if (mode === "oauth_start") {
    const redirectUri = String(body.redirect_uri ?? "");
    if (redirectUri !== GOOGLE_CALENDAR_REDIRECT_URI) throw new Error("Invalid Google Calendar redirect URI");
    const state = await signedState(user.id);
    const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: GOOGLE_CALENDAR_SCOPE, state });
    return json({ authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  }
  if (mode === "oauth_callback") {
    const redirectUri = String(body.redirect_uri ?? "");
    const state = String(body.state ?? "");
    if (redirectUri !== GOOGLE_CALENDAR_REDIRECT_URI || !(await verifyState(state, user.id))) throw new Error("Invalid Google OAuth state or redirect URI");
    const token = await googleToken({ code: String(body.code ?? ""), grant_type: "authorization_code", redirect_uri: redirectUri });
    await saveConnection(user.id, token);
    return json({ connected: true, backfill: { pushed: 0 } });
  }
  if (mode === "exchange_token") {
    await saveConnection(user.id, { access_token: String(body.provider_token ?? ""), refresh_token: body.provider_refresh_token ? String(body.provider_refresh_token) : undefined, expires_in: 3600 });
    return json({ connected: true });
  }
  if (mode === "status") {
    const { data, error } = await admin.from("google_calendar_sync_tokens").select("calendar_id,sync_enabled,needs_reauth,last_sync_at,last_sync_error,created_at").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return json({ connected: Boolean(data), ...data, connected_at: data?.created_at ?? null });
  }
  if (mode === "disconnect") {
    const { error } = await admin.from("google_calendar_sync_tokens").delete().eq("user_id", user.id);
    if (error) throw error;
    return json({ disconnected: true });
  }
  if (mode === "sync_appointment") return json(await syncAppointment(user.id, (body.appointment ?? {}) as Record<string, unknown>));
  if (mode === "backfill") return json({ pushed: 0, message: "Backfill requires the caller to provide appointment records." });
  throw new Error(`Unsupported mode: ${mode}`);
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Google Calendar request failed" }, 400);
  }
});
