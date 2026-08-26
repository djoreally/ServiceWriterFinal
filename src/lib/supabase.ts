import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
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
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return createClient(url, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createSupabaseAdminClient() {
  // Use only in trusted server jobs/webhooks. Never expose this client to the browser.
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
