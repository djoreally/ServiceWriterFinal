import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const CANONICAL_SUPABASE_URL = "https://rjfbrfognxqkyhdrpibx.supabase.co";
const CANONICAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-TAyW6MChnKyB_0yICU79g_miXrX3xy";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function serverSupabaseUrl(): string {
  return process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || CANONICAL_SUPABASE_URL;
}

function browserSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || CANONICAL_SUPABASE_URL;
}

function publishableSupabaseKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || CANONICAL_SUPABASE_PUBLISHABLE_KEY;
}

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    browserSupabaseUrl(),
    publishableSupabaseKey(),
  );
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    serverSupabaseUrl(),
    publishableSupabaseKey(),
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot always mutate cookies; middleware refreshes them.
          }
        },
      },
    },
  );
}

export function createSupabaseRequestClient(accessToken: string) {
  // Server-only request client. The bearer token remains the effective user
  // identity for Auth/PostgREST; the service-role key is used only as the
  // server-side apikey when available. Otherwise the canonical public key is
  // sufficient because the user bearer token remains the effective identity.
  const url = serverSupabaseUrl();
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || publishableSupabaseKey();
  return createClient(url, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createSupabaseAdminClient() {
  // Use only in trusted server jobs/webhooks. Never expose this client to the browser.
  return createClient(serverSupabaseUrl(), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
