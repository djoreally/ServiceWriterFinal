import 'server-only';

export class IdempotencyKeyError extends Error {
  readonly status = 400;
  readonly code = 'idempotency_key_required';

  constructor(message = 'A valid idempotency-key header is required') {
    super(message);
    this.name = 'IdempotencyKeyError';
  }
}

export function requireIdempotencyKey(request: Request) {
  const key = request.headers.get('idempotency-key')?.trim();
  if (!key || key.length < 8 || key.length > 256) throw new IdempotencyKeyError();
  return key;
}
