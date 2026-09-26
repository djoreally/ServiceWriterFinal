import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get('sw_access_token')?.value;
  const refreshToken = request.cookies.get('sw_refresh_token')?.value;

  if (!accessToken && !refreshToken) return redirectToLogin(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return redirectToLogin(request);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (accessToken) {
    const { data } = await client.auth.getUser(accessToken);
    if (data.user) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-sw-access-token', accessToken);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  if (!refreshToken) return redirectToLogin(request);

  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return redirectToLogin(request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-sw-access-token', data.session.access_token);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
  response.cookies.set('sw_access_token', data.session.access_token, {
    ...options,
    maxAge: data.session.expires_in,
  });
  response.cookies.set('sw_refresh_token', data.session.refresh_token, {
    ...options,
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
