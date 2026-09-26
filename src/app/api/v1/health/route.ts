import { apiOk, requestId } from '@/server/http/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = requestId(request);
  return apiOk(
    {
      service: 'service-writer-api',
      status: 'ok',
      version: 'v1',
      timestamp: new Date().toISOString(),
    },
    id,
  );
}
