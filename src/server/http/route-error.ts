import { apiError } from './api-response';
import { RequestValidationError } from './validation';

export function routeError(error: unknown, requestId: string) {
  if (error instanceof RequestValidationError) {
    return apiError(400, 'validation_error', error.issues.map((issue) => issue.message).join('; '), requestId);
  }

  if (error && typeof error === 'object') {
    const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
    if (typeof candidate.status === 'number' && typeof candidate.code === 'string') {
      return apiError(
        candidate.status,
        candidate.code,
        typeof candidate.message === 'string' ? candidate.message : 'Request failed',
        requestId,
      );
    }
  }

  console.error('[api] unhandled route error', { requestId, error });
  return apiError(500, 'internal_error', 'Internal server error', requestId);
}
