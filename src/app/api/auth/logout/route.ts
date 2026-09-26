import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.set('sw_access_token', '', { path: '/', maxAge: 0 });
  response.cookies.set('sw_refresh_token', '', { path: '/', maxAge: 0 });
  return response;
}
