import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const GOOGLE_OAUTH_STATE_SECRET = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET") ?? "";
const GOOGLE_TOKEN_ENCRYPTION_KEY = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY") ?? "";
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") ?? "";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", ...cors },
});

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function fromB64url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}
async function hmac(value: string) {
  if (!GOOGLE_OAUTH_STATE_SECRET) throw new Error("Google OAuth state signing is not configured");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(GOOGLE_OAUTH_STATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
async function signedState(userId: string, workspaceId: string) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ sub: userId, workspace_id: workspaceId, exp: Date.now() + 10 * 60_000, nonce: crypto.randomUUID() })));
  return `${payload}.${await hmac(payload)}`;
}
async function verifyState(state: string, userId: string, workspaceId: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = await hmac(payload);
  if (expected !== signature) return false;
  const decoded = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { sub?: string; workspace_id?: string; exp?: number };
  return decoded.sub === userId && decoded.workspace_id === workspaceId && typeof decoded.exp === "number" && decoded.exp > Date.now();
}
async function cryptoKey() {
  if (!GOOGLE_TOKEN_ENCRYPTION_KEY) throw new Error("Google token encryption is not configured");
  const raw = fromB64url(GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string | null | undefined) {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(value)));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv); combined.set(ciphertext, iv.length);
  return b64url(combined);
}
async function decrypt(value: string | null | undefined) {
  if (!value) return null;
  const combined = fromB64url(value);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, await cryptoKey(), combined.slice(12));
  return new TextDecoder().decode(plaintext);
}
async function authenticatedUser(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Not authenticated");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user;
}
async function authorizeWorkspace(userId: string, workspaceId: string) {
  const { data, error } = await admin.from("workspace_members")
    .select("role,is_active")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Workspace access denied");
  return data;
}
async function googleToken(body: Record<string, string>) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, ...body }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Google token exchange failed");
  return data as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}
async function saveTokens(workspaceId: string, userId: string, token: { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }) {
  const { data: existing, error: readError } = await admin.from("google_insights_connections")
    .select("refresh_token_encrypted,analytics_property_id,analytics_property_name")
    .eq("workspace_id", workspaceId).maybeSingle();
  if (readError) throw readError;
  const refresh = token.refresh_token ? await encrypt(token.refresh_token) : existing?.refresh_token_encrypted ?? null;
  const { error } = await admin.from("google_insights_connections").upsert({
    workspace_id: workspaceId,
    connected_by: userId,
    access_token_encrypted: token.access_token ? await encrypt(token.access_token) : null,
    refresh_token_encrypted: refresh,
    token_expires_at: new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000).toISOString(),
    scopes: (token.scope || ANALYTICS_SCOPE).split(/\s+/).filter(Boolean),
    analytics_property_id: existing?.analytics_property_id ?? null,
    analytics_property_name: existing?.analytics_property_name ?? null,
    needs_reauth: false,
    last_sync_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
  if (error) throw error;
}
async function accessToken(workspaceId: string) {
  const { data, error } = await admin.from("google_insights_connections").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Google Analytics is not connected");
  const expiresAt = Date.parse(data.token_expires_at || "");
  if (data.access_token_encrypted && expiresAt > Date.now() + 60_000) return { token: await decrypt(data.access_token_encrypted), connection: data };
  const refresh = await decrypt(data.refresh_token_encrypted);
  if (!refresh) throw new Error("Google Analytics authorization needs to be reconnected");
  try {
    const refreshed = await googleToken({ grant_type: "refresh_token", refresh_token: refresh });
    await saveTokens(workspaceId, data.connected_by, refreshed);
    return { token: refreshed.access_token, connection: data };
  } catch (error) {
    await admin.from("google_insights_connections").update({ needs_reauth: true, last_sync_error: String(error), updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
    throw error;
  }
}
async function googleJson(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Google API request failed (${response.status})`);
  return data;
}
async function analyticsResources(workspaceId: string) {
  const { token } = await accessToken(workspaceId);
  const data = await googleJson("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", token!);
  const analytics: Array<{ id: string; name: string; account: string }> = [];
  for (const account of data.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      analytics.push({ id: String(property.property || "").replace(/^properties\//, ""), name: property.displayName || property.property, account: account.displayName || account.account || "Google Analytics" });
    }
  }
  return analytics.filter((item) => item.id);
}
function metric(row: any, index: number) { return Number(row?.metricValues?.[index]?.value || 0); }
async function analyticsOverview(workspaceId: string, days: number) {
  const { token, connection } = await accessToken(workspaceId);
  const propertyId = connection.analytics_property_id;
  if (!propertyId) throw new Error("Choose a Google Analytics property first");
  const boundedDays = Math.min(Math.max(Math.round(days || 30), 1), 365);
  const requestBody = {
    dateRanges: [{ startDate: `${boundedDays}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "newUsers" }, { name: "keyEvents" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  };
  let data;
  try {
    data = await googleJson(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, token!, { method: "POST", body: JSON.stringify(requestBody) });
  } catch (error) {
    const fallback = { ...requestBody, metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "newUsers" }, { name: "conversions" }] };
    data = await googleJson(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, token!, { method: "POST", body: JSON.stringify(fallback) });
  }
  const rows = (data.rows ?? []).map((row: any) => ({ date: row.dimensionValues?.[0]?.value || "", activeUsers: metric(row, 0), sessions: metric(row, 1), newUsers: metric(row, 2), conversions: metric(row, 3) }));
  const totals = rows.reduce((acc: any, row: any) => ({ activeUsers: acc.activeUsers + row.activeUsers, sessions: acc.sessions + row.sessions, newUsers: acc.newUsers + row.newUsers, conversions: acc.conversions + row.conversions }), { activeUsers: 0, sessions: 0, newUsers: 0, conversions: 0 });
  await admin.from("google_insights_connections").update({ last_synced_at: new Date().toISOString(), last_sync_error: null, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
  return { property_id: propertyId, property_name: connection.analytics_property_name, days: boundedDays, totals, rows };
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
  const user = await authenticatedUser(request);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const workspaceId = String(body.workspace_id ?? "");
  if (!workspaceId) throw new Error("workspace_id is required");
  await authorizeWorkspace(user.id, workspaceId);
  const mode = String(body.mode ?? "status");

  if (mode === "oauth_start") {
    const redirectUri = String(body.redirect_uri ?? "");
    if (!GOOGLE_REDIRECT_URI || redirectUri !== GOOGLE_REDIRECT_URI) throw new Error("Invalid Google redirect URI");
    const state = await signedState(user.id, workspaceId);
    const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: ANALYTICS_SCOPE, state });
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  }
  if (mode === "oauth_callback") {
    const redirectUri = String(body.redirect_uri ?? "");
    const state = String(body.state ?? "");
    if (!GOOGLE_REDIRECT_URI || redirectUri !== GOOGLE_REDIRECT_URI || !(await verifyState(state, user.id, workspaceId))) throw new Error("Invalid Google OAuth state or redirect URI");
    const token = await googleToken({ code: String(body.code ?? ""), grant_type: "authorization_code", redirect_uri: redirectUri });
    await saveTokens(workspaceId, user.id, token);
    return json({ connected: true });
  }
  if (mode === "status") {
    const { data, error } = await admin.from("google_insights_connections").select("analytics_property_id,analytics_property_name,business_location_id,business_location_name,last_synced_at,last_sync_error,needs_reauth,created_at").eq("workspace_id", workspaceId).maybeSingle();
    if (error) throw error;
    return json({ connected: Boolean(data), ...data });
  }
  if (mode === "resources") return json({ analytics: await analyticsResources(workspaceId), businessAccounts: [], locations: [] });
  if (mode === "select") {
    const requested = body.analytics_property_id ? String(body.analytics_property_id) : null;
    let name: string | null = null;
    if (requested) {
      const available = await analyticsResources(workspaceId);
      const matched = available.find((item) => item.id === requested);
      if (!matched) throw new Error("Selected Analytics property is not available to this Google account");
      name = matched.name;
    }
    const { error } = await admin.from("google_insights_connections").update({ analytics_property_id: requested, analytics_property_name: name, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
    if (error) throw error;
    return json({ saved: true, analytics_property_id: requested, analytics_property_name: name });
  }
  if (mode === "analytics_overview") return json(await analyticsOverview(workspaceId, Number(body.days ?? 30)));
  if (mode === "disconnect") {
    const { error } = await admin.from("google_insights_connections").delete().eq("workspace_id", workspaceId);
    if (error) throw error;
    return json({ disconnected: true });
  }
  if (mode.startsWith("gbp_")) return json({ error: "Google Business Profile is not part of this Analytics connection yet." }, 501);
  throw new Error(`Unsupported mode: ${mode}`);
}

Deno.serve(async (request) => {
  try { return await handle(request); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Google Analytics request failed" }, 400); }
});
