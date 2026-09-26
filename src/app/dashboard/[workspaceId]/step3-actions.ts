'use server';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getDb } from '@/db/client';
import { appointments, serviceCatalog, workspaceSettings } from '@/db/schema';
import { issueInvoiceFromQuoteCommand } from '@/server/application/invoices/issue-invoice-from-quote';
import { createQuoteFromWorkOrderCommand } from '@/server/application/quotes/create-quote-from-work-order';
import { decideQuoteCommand } from '@/server/application/quotes/decide-quote';
import { sendQuoteCommand } from '@/server/application/quotes/send-quote';
import { addWorkOrderItemCommand } from '@/server/application/work-orders/add-work-order-item';
import { createWorkOrderCommand } from '@/server/application/work-orders/create-work-order';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { createStripeInvoiceCheckoutSession } from '@/server/payments/stripe/create-invoice-checkout-session';

const STAFF_WRITE=new Set(['owner','admin','manager','service_advisor','dispatcher','receptionist']);

function field(formData:FormData,key:string){
  const value=formData.get(key);
  return typeof value==='string'?value.trim():'';
}
function ensureWriter(role:string){
  if(!STAFF_WRITE.has(role)) throw new Error('Your workspace role cannot perform this action.');
}
function target(workspaceId:string,module:string,kind:'notice'|'error',message:string){
  return '/dashboard/'+workspaceId+'/'+module+'?'+new URLSearchParams({[kind]:message}).toString();
}
function message(error:unknown){
  return error instanceof Error && error.message ? error.message : 'The operation could not be completed.';
}

export async function createWorkOrderAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureWriter(workspace.role);
  const appointmentId=field(formData,'appointmentId')||null;
  let customerId=field(formData,'customerId');
  let vehicleId=field(formData,'vehicleId')||null;
  let locationId:string|null=null;
  let bookedServiceId:string|null=null;

  try{
    if(appointmentId){
      const [appointment]=await getDb().select({
        customerId:appointments.customerId,vehicleId:appointments.vehicleId,locationId:appointments.locationId,metadata:appointments.metadata,
      }).from(appointments).where(and(eq(appointments.workspaceId,workspaceId),eq(appointments.id,appointmentId))).limit(1);
      if(!appointment) throw new Error('Appointment was not found in this workspace.');
      customerId=appointment.customerId; vehicleId=appointment.vehicleId; locationId=appointment.locationId;
      const bookingMeta=appointment.metadata && typeof appointment.metadata==='object' ? (appointment.metadata as Record<string,unknown>).publicBooking : null;
      if(bookingMeta && typeof bookingMeta==='object'){
        const candidate=(bookingMeta as Record<string,unknown>).serviceCatalogId;
        bookedServiceId=typeof candidate==='string'?candidate:null;
      }
    }
    if(!customerId) throw new Error('Choose an appointment or customer.');
    const workOrder=await createWorkOrderCommand({
      workspaceId,actorUserId:user.id,idempotencyKey:randomUUID(),appointmentId,customerId,vehicleId,locationId,
      priority:(field(formData,'priority')||'normal') as 'low'|'normal'|'high'|'urgent',
      complaint:field(formData,'complaint')||null,
    });
    if(bookedServiceId){
      const [[service],[settings]]=await Promise.all([
        getDb().select().from(serviceCatalog).where(and(eq(serviceCatalog.workspaceId,workspaceId),eq(serviceCatalog.id,bookedServiceId),eq(serviceCatalog.isActive,true))).limit(1),
        getDb().select({taxRate:workspaceSettings.taxRate}).from(workspaceSettings).where(eq(workspaceSettings.workspaceId,workspaceId)).limit(1),
      ]);
      if(service) await addWorkOrderItemCommand({workspaceId,workOrderId:workOrder.id,serviceCatalogId:service.id,itemType:'service',description:service.name,quantity:'1',unitPrice:service.laborPrice,taxRate:settings?.taxRate??'0',sortOrder:0,idempotencyKey:randomUUID()});
    }
  }catch(error){ redirect(target(workspaceId,'work-orders','error',message(error))); }
  revalidatePath('/dashboard/'+workspaceId+'/work-orders');
  redirect(target(workspaceId,'work-orders','notice','Work order created.'));
}

export async function addServiceToWorkOrderAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureWriter(workspace.role);
  const workOrderId=field(formData,'workOrderId'); const serviceId=field(formData,'serviceId');
  try{
    const [[service],[settings]]=await Promise.all([
      getDb().select().from(serviceCatalog).where(and(eq(serviceCatalog.workspaceId,workspaceId),eq(serviceCatalog.id,serviceId),eq(serviceCatalog.isActive,true))).limit(1),
      getDb().select({taxRate:workspaceSettings.taxRate}).from(workspaceSettings).where(eq(workspaceSettings.workspaceId,workspaceId)).limit(1),
    ]);
    if(!service) throw new Error('Choose an active service.');
    await addWorkOrderItemCommand({
      workspaceId,workOrderId,serviceCatalogId:service.id,itemType:'service',description:service.name,
      quantity:'1',unitPrice:service.laborPrice,taxRate:settings?.taxRate??'0',sortOrder:0,
      idempotencyKey:randomUUID(),
    });
  }catch(error){ redirect(target(workspaceId,'work-orders','error',message(error))); }
  revalidatePath('/dashboard/'+workspaceId+'/work-orders');
  redirect(target(workspaceId,'work-orders','notice','Service added to work order.'));
}

export async function createQuoteAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureWriter(workspace.role);
  try{
    await createQuoteFromWorkOrderCommand({
      workspaceId,workOrderId:field(formData,'workOrderId'),actorUserId:user.id,idempotencyKey:randomUUID(),
    });
  }catch(error){ redirect(target(workspaceId,'work-orders','error',message(error))); }
  revalidatePath('/dashboard/'+workspaceId+'/quotes');
  redirect(target(workspaceId,'quotes','notice','Quote created from work order.'));
}

export async function sendQuoteAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureWriter(workspace.role);
  try{ await sendQuoteCommand({workspaceId,quoteId:field(formData,'quoteId'),actorUserId:user.id,idempotencyKey:randomUUID()}); }
  catch(error){ redirect(target(workspaceId,'quotes','error',message(error))); }
  revalidatePath('/dashboard/'+workspaceId+'/quotes');
  redirect(target(workspaceId,'quotes','notice','Quote moved to sent.'));
}

export async function decideQuoteAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureWriter(workspace.role);
  const decision=field(formData,'decision');
  if(decision!=='approved'&&decision!=='declined') redirect(target(workspaceId,'quotes','error','Invalid quote decision.'));
  try{
    await decideQuoteCommand({
      workspaceId,quoteId:field(formData,'quoteId'),decision,actorUserId:user.id,approvalMethod:'staff',
      reason:field(formData,'reason')||null,idempotencyKey:randomUUID(),
    });
  }catch(error){ redirect(target(workspaceId,'quotes','error',message(error))); }
  revalidatePath('/dashboard/'+workspaceId+'/quotes');
  redirect(target(workspaceId,'quotes','notice',decision==='approved'?'Quote approved.':'Quote declined.'));
}

export async function issueInvoiceAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureWriter(workspace.role);
  try{
    await issueInvoiceFromQuoteCommand({
      workspaceId,quoteId:field(formData,'quoteId'),actorUserId:user.id,idempotencyKey:randomUUID(),
    });
  }catch(error){ redirect(target(workspaceId,'quotes','error',message(error))); }
  revalidatePath('/dashboard/'+workspaceId+'/invoices');
  redirect(target(workspaceId,'invoices','notice','Invoice issued.'));
}

export async function startStripeCheckoutAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureWriter(workspace.role);
  const invoiceId=field(formData,'invoiceId');
  const requestHeaders=headers();
  const host=requestHeaders.get('x-forwarded-host')??requestHeaders.get('host');
  const protocol=requestHeaders.get('x-forwarded-proto')??'https';
  if(!host) redirect(target(workspaceId,'invoices','error','Could not determine the Service Writer return URL.'));
  const base=protocol+'://'+host;
  let checkoutUrl:string;
  try{
    const checkout=await createStripeInvoiceCheckoutSession({
      workspaceId,invoiceId,idempotencyKey:randomUUID(),
      successUrl:base+'/dashboard/'+workspaceId+'/payments?notice='+encodeURIComponent('Payment submitted. Stripe confirmation will update the invoice.'),
      cancelUrl:base+'/dashboard/'+workspaceId+'/invoices?notice='+encodeURIComponent('Payment was cancelled.'),
    });
    checkoutUrl=checkout.checkoutUrl;
  }catch(error){ redirect(target(workspaceId,'invoices','error',message(error))); }
  redirect(checkoutUrl);
}
