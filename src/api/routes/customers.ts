import { z } from 'zod';
import type { Hono } from 'hono';

import { createCustomerCommand } from '@/server/application/customers/create-customer';
import { listCustomers } from '@/server/repositories/customers.repository';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { requestId } from '@/server/http/api-response';
import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_READ_ROLES, STAFF_WRITE_ROLES } from '@/platform/auth/roles';

const listSchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const createSchema = z.object({
  firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120),
  companyName: z.string().trim().max(200).nullable().optional(), email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(), addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(), city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(), postalCode: z.string().trim().max(32).nullable().optional(),
  countryCode: z.string().trim().length(2).default('US'), notes: z.string().trim().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

function errorResponse(c: any, error: unknown, requestId: string) {
  if (error && typeof error === 'object') {
    const e=error as {status?:unknown;code?:unknown;message?:unknown};
    if(typeof e.status==='number' && typeof e.code==='string') return c.json({ok:false,error:{code:e.code,message:typeof e.message==='string'?e.message:'Request failed',requestId}},e.status);
  }
  console.error('[api] unhandled route error',{requestId,error});
  return c.json({ok:false,error:{code:'internal_error',message:'Internal server error',requestId}},500);
}

export function registerCustomerRoutes(app: Hono) {
  app.get('/customers', async (c) => {
    const id=requestId(c.req.raw);
    try {
      const ctx=await requireWorkspaceContext(c.req.raw, STAFF_READ_ROLES);
      const parsed=listSchema.safeParse(c.req.query());
      if(!parsed.success) return c.json({ok:false,error:{code:'validation_error',message:parsed.error.issues.map(i=>i.message).join('; '),requestId:id}},400);
      const rows=await listCustomers(ctx.workspaceId,parsed.data);
      return c.json({ok:true,data:{customers:rows,limit:parsed.data.limit,offset:parsed.data.offset},requestId:id});
    } catch(error){ return errorResponse(c,error,id); }
  });
  app.post('/customers', async (c) => {
    const id=requestId(c.req.raw);
    try {
      const ctx=await requireWorkspaceContext(c.req.raw, STAFF_WRITE_ROLES);
      const parsed=createSchema.safeParse(await c.req.json());
      if(!parsed.success) return c.json({ok:false,error:{code:'validation_error',message:parsed.error.issues.map(i=>i.message).join('; '),requestId:id}},400);
      const b=parsed.data;
      const customer=await createCustomerCommand({workspaceId:ctx.workspaceId,actorUserId:ctx.user.id,...b,countryCode:b.countryCode.toUpperCase(),companyName:b.companyName??null,email:b.email??null,phone:b.phone??null,addressLine1:b.addressLine1??null,addressLine2:b.addressLine2??null,city:b.city??null,region:b.region??null,postalCode:b.postalCode??null,notes:b.notes??null,traceId:id,idempotencyKey:requireIdempotencyKey(c.req.raw)});
      return c.json({ok:true,data:{customer},requestId:id},201);
    } catch(error){ return errorResponse(c,error,id); }
  });
}
