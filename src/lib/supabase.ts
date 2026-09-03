import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const CANONICAL_SUPABASE_URL = "https://rjfbrfognxqkyhdrpibx.supabase.co";

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

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    browserSupabaseUrl(),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    serverSupabaseUrl(),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
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
  // server-side apikey when the Vercel publishable key is stale or mismatched.
  const url = serverSupabaseUrl();
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
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
