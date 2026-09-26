import { z } from 'zod';

import { createServiceCommand } from '@/server/application/services/create-service';
import { requireWorkspaceContext } from '@/platform/auth/context';
import { SERVICE_CATALOG_WRITE_ROLES, STAFF_READ_ROLES, STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { routeError } from '@/server/http/route-error';
import { parseJson, parseSearchParams } from '@/server/http/validation';
import { listServices } from '@/server/repositories/services.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listSchema = z.object({
  activeOnly: z.enum(['true','false']).default('true').transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  estimatedMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  laborPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  isActive: z.boolean().default(true),
  inspectionTemplateId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_READ_ROLES);
    const query = parseSearchParams(request, listSchema);
    const services = await listServices(ctx.workspaceId, query);
    return withCors(apiOk({ services, limit: query.limit, offset: query.offset }, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, SERVICE_CATALOG_WRITE_ROLES);
    const body = await parseJson(request, createSchema);
    const service = await createServiceCommand({
      workspaceId: ctx.workspaceId,
      ...body,
      description: body.description ?? null,
      category: body.category ?? null,
      estimatedMinutes: body.estimatedMinutes ?? null,
      inspectionTemplateId: body.inspectionTemplateId ?? null,
      traceId: id,
      idempotencyKey: requireIdempotencyKey(request),
    });
    return withCors(apiOk({ service }, id, 201), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
