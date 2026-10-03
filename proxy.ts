import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_PRODUCTION_HOST = "www.servicewriter.xyz";

const CUTOVER_DISABLED_API_PREFIXES = [
  "/api/v1/appointment-items",
  "/api/v1/billing",
  "/api/v1/command-center",
  "/api/v1/crm",
  "/api/v1/dispatch",
  "/api/v1/dispatch-events",
  "/api/v1/imports",
  "/api/v1/invitations",
  "/api/v1/newsletter",
  "/api/v1/reviews/actions",
  "/api/v1/workforce-identity",
  "/api/v1/payments/actions",
  "/api/v1/payments/stripe-direct",
  "/api/webhooks/stripe",
] as const;

function canonicalProductionRedirect(request: NextRequest): NextResponse | null {
  if (process.env.VERCEL_ENV !== "production" || request.nextUrl.pathname.startsWith("/api/")) return null;
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (!hostname.endsWith(".vercel.app")) return null;
  const target = request.nextUrl.clone();
  target.protocol = "https:";
  target.hostname = CANONICAL_PRODUCTION_HOST;
  target.port = "";
  return NextResponse.redirect(target, 307);
}

function cutoverDisabledResponse(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  const blocked = CUTOVER_DISABLED_API_PREFIXES.find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!blocked) return null;
  return NextResponse.json({
    error: {
      code: "legacy_api_cutover_disabled",
      message: "This legacy ServiceWriterFinal business API is disabled during canonical backend cutover.",
      legacyPrefix: blocked,
    },
  }, { status: 410, headers: { "cache-control": "no-store" } });
}

export async function proxy(request: NextRequest) {
  const canonicalRedirect = canonicalProductionRedirect(request);
  if (canonicalRedirect) return canonicalRedirect;

  const disabled = cutoverDisabledResponse(request);
  if (disabled) return disabled;

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  // Supabase remains an identity/session provider during Stage 22. Business
  // persistence is owned by service-Writer-backend and must not be restored here.
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
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
