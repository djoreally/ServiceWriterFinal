import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getEnvVar } from '@/utils/get-env-var';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

function authClient() {
  return createClient(
    getEnvVar(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    getEnvVar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

function sanitizeRedirectPath(candidate?: string): string {
  if (!candidate || typeof candidate !== 'string') return '/dashboard';
  const trimmed = candidate.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('/ ') ||
    trimmed.startsWith('/%2f') ||
    trimmed.startsWith('/%2F') ||
    trimmed.startsWith('/%5c') ||
    trimmed.startsWith('/%5C')
  ) {
    return '/dashboard';
  }
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return '/dashboard';
    return parsed.pathname + parsed.search;
  } catch {
    return '/dashboard';
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  });

  if (!parsed.success) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'Enter a valid email and password.');
    return NextResponse.redirect(url, 303);
  }

  const { email, password } = parsed.data;
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'Email or password was not accepted.');
    return NextResponse.redirect(url, 303);
  }

  const destination = sanitizeRedirectPath(parsed.data.next);

  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.cookies.set('sw_access_token', data.session.access_token, cookieOptions(data.session.expires_in));
  response.cookies.set('sw_refresh_token', data.session.refresh_token, cookieOptions(60 * 60 * 24 * 30));
  return response;
}
