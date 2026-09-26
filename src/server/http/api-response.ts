import { NextResponse } from 'next/server';
import { z } from 'zod';

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export function requestId(request: Request) {
  const supplied = request.headers.get('x-request-id')?.trim();
  if (supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)) return supplied;
  return crypto.randomUUID();
}

export function apiError(status: number, code: string, message: string, id: string) {
  return NextResponse.json(
    { ok: false, error: { code, message, requestId: id } },
    { status, headers: { 'x-request-id': id } },
  );
}

export function apiOk<T>(data: T, id: string, status = 200) {
  return NextResponse.json(
    { ok: true, data, requestId: id },
    { status, headers: { 'x-request-id': id } },
  );
}
