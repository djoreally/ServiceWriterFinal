import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_PRODUCTION_HOST = "www.servicewriter.xyz";

function canonicalProductionRedirect(request: NextRequest): NextResponse | null {
  // Keep API/webhook/cron traffic on its requested host so signed requests,
  // authorization headers, and provider callbacks are never changed by a
  // cross-origin redirect. Browser navigation is the surface that must be
  // canonicalized to prevent stale Vercel-origin auth/session state.
  if (process.env.VERCEL_ENV !== "production" || request.nextUrl.pathname.startsWith("/api/")) {
    return null;
  }

  const hostname = request.nextUrl.hostname.toLowerCase();
  if (!hostname.endsWith(".vercel.app")) return null;

  const target = request.nextUrl.clone();
  target.protocol = "https:";
  target.hostname = CANONICAL_PRODUCTION_HOST;
  target.port = "";
  return NextResponse.redirect(target, 307);
}

export async function proxy(request: NextRequest) {
  const canonicalRedirect = canonicalProductionRedirect(request);
  if (canonicalRedirect) return canonicalRedirect;

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|mp4)$).*)"],
};
