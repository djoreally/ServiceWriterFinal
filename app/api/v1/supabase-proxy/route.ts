import { NextResponse } from "next/server";
import {
  SUPABASE_PUBLISHABLE_KEY_RESOLVED,
  SUPABASE_URL_RESOLVED,
} from "@/integrations/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREFIXES = ["/rest/v1/", "/functions/v1/", "/storage/v1/"] as const;
const FORWARDED_REQUEST_HEADERS = [
  "authorization",
  "accept",
  "content-type",
  "prefer",
  "range",
  "range-unit",
  "accept-profile",
  "content-profile",
  "x-client-info",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-range",
  "range-unit",
  "location",
  "preference-applied",
  "x-supabase-api-version",
] as const;

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function forward(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json(
      { error: { code: "forbidden_origin", message: "Cross-origin proxy access is not allowed." } },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "";
  if (!path.startsWith("/") || !isAllowedPath(path)) {
    return NextResponse.json(
      { error: { code: "invalid_supabase_path", message: "Unsupported Supabase proxy path." } },
      { status: 400 },
    );
  }

  const upstreamUrl = new URL(path, SUPABASE_URL_RESOLVED);
  if (upstreamUrl.origin !== new URL(SUPABASE_URL_RESOLVED).origin) {
    return NextResponse.json(
      { error: { code: "invalid_supabase_origin", message: "Unsupported Supabase origin." } },
      { status: 400 },
    );
  }

  const headers = new Headers();
  for (const key of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY_RESOLVED);

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const response = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  for (const key of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("Cache-Control", "no-store");

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
export const OPTIONS = forward;
