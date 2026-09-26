import { z } from 'zod';

import { requireWorkspaceContext } from '@/platform/auth/context';
import { SERVICE_CATALOG_WRITE_ROLES, STAFF_READ_ROLES, STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { routeError } from '@/server/http/route-error';
import { parseJson, parseSearchParams } from '@/server/http/validation';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { createVehicleCommand } from '@/server/application/vehicles/create-vehicle';
import { listVehicles } from '@/server/repositories/vehicles.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  vin: z.string().trim().min(11).max(17).nullable().optional(),
  year: z.number().int().min(1886).max(2100).nullable().optional(),
  make: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  trim: z.string().trim().max(120).nullable().optional(),
  licensePlate: z.string().trim().max(32).nullable().optional(),
  plateRegion: z.string().trim().max(32).nullable().optional(),
  color: z.string().trim().max(80).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  mileageUnit: z.enum(['mi','km']).default('mi'),
  notes: z.string().trim().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_READ_ROLES);
    const query = parseSearchParams(request, listSchema);
    const rows = await listVehicles(ctx.workspaceId, query);
    return withCors(apiOk({ vehicles: rows, limit: query.limit, offset: query.offset }, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const body = await parseJson(request, createSchema);
    const idempotencyKey = requireIdempotencyKey(request);
    const vehicle = await createVehicleCommand({
      workspaceId: ctx.workspaceId,
      customerId: body.customerId ?? null,
      vin: body.vin?.toUpperCase() ?? null,
      year: body.year ?? null,
      make: body.make ?? null,
      model: body.model ?? null,
      trim: body.trim ?? null,
      licensePlate: body.licensePlate?.toUpperCase() ?? null,
      plateRegion: body.plateRegion?.toUpperCase() ?? null,
      color: body.color ?? null,
      mileage: body.mileage ?? null,
      mileageUnit: body.mileageUnit,
      notes: body.notes ?? null,
      metadata: body.metadata,
      traceId: id,
      idempotencyKey,
    });

    return withCors(apiOk({ vehicle }, id, 201), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
