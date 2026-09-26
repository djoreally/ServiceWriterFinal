export function getRequestId(request: Request) {
  return request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
}
