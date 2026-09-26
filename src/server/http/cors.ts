import { NextResponse } from 'next/server';

function allowedOrigins() {
  return new Set(
    (process.env.SERVICE_WRITER_WEB_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins().has(origin)) return {};

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, x-request-id, x-workspace-id, idempotency-key',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    vary: 'Origin',
  };
}

export function withCors<T extends Response>(response: T, request: Request): T {
  for (const [name, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(name, value);
  }
  return response;
}

export function corsPreflight(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins().has(origin)) {
    return NextResponse.json(
      { ok: false, error: { code: 'origin_not_allowed', message: 'Origin is not allowed' } },
      { status: 403, headers: { vary: 'Origin' } },
    );
  }
  return withCors(new NextResponse(null, { status: 204 }), request);
}
