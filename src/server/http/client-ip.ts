import 'server-only';

/**
 * Resolve the client address only from deployment-controlled forwarding headers.
 * Never accept a client IP as JSON/form input because approval evidence must be
 * derived by the server boundary, not asserted by the browser.
 */
export function requestClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim().slice(0, 64) || null;

  const realIp = request.headers.get('x-real-ip')?.trim();
  return realIp ? realIp.slice(0, 64) : null;
}
