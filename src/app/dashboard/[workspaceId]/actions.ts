'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createAppointmentCommand } from '@/server/application/appointments/create-appointment';
import { createCustomerCommand } from '@/server/application/customers/create-customer';
import { createServiceCommand } from '@/server/application/services/create-service';
import { createVehicleCommand } from '@/server/application/vehicles/create-vehicle';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';

const STAFF_WRITE = new Set(['owner','admin','manager','service_advisor','dispatcher','receptionist']);
const CATALOG_WRITE = new Set(['owner','admin','manager','service_advisor']);

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
function nullableText(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value || null;
}
function ensureRole(role: string, allowed: Set<string>) {
  if (!allowed.has(role)) throw new Error('Your workspace role cannot perform this action.');
}
function resultPath(workspaceId: string, module: string, kind: 'notice'|'error', message: string) {
  const params = new URLSearchParams({ [kind]: message });
  return `/dashboard/${workspaceId}/${module}?${params.toString()}`;
}

export async function createCustomerAction(workspaceId: string, formData: FormData) {
  const user = await requirePageUser();
  const { workspace } = await requirePageWorkspace(user.id, workspaceId);
  ensureRole(workspace.role, STAFF_WRITE);
  const parsed = z.object({
    firstName:z.string().min(1).max(120), lastName:z.string().min(1).max(120),
    email:z.string().email().or(z.literal('')), phone:z.string().max(50),
    companyName:z.string().max(200), city:z.string().max(120), region:z.string().max(120),
  }).safeParse({
    firstName:textValue(formData,'firstName'), lastName:textValue(formData,'lastName'),
    email:textValue(formData,'email'), phone:textValue(formData,'phone'),
    companyName:textValue(formData,'companyName'), city:textValue(formData,'city'), region:textValue(formData,'region'),
  });
  if (!parsed.success) redirect(resultPath(workspaceId,'customers','error','Check the customer information and try again.'));
  await createCustomerCommand({
    workspaceId, actorUserId:user.id, idempotencyKey:randomUUID(),
    firstName:parsed.data.firstName, lastName:parsed.data.lastName,
    email:parsed.data.email||null, phone:parsed.data.phone||null, companyName:parsed.data.companyName||null,
    city:parsed.data.city||null, region:parsed.data.region||null,
  });
  revalidatePath(`/dashboard/${workspaceId}/customers`);
  redirect(resultPath(workspaceId,'customers','notice','Customer created.'));
}

export async function createVehicleAction(workspaceId: string, formData: FormData) {
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureRole(workspace.role,STAFF_WRITE);
  const yearText=textValue(formData,'year'); const mileageText=textValue(formData,'mileage');
  const parsed=z.object({
    customerId:z.string().uuid().or(z.literal('')), year:z.number().int().min(1886).max(2100).nullable(),
    make:z.string().min(1).max(120), model:z.string().min(1).max(120), trim:z.string().max(120),
    vin:z.string().max(17), mileage:z.number().int().min(0).nullable(),
  }).safeParse({
    customerId:textValue(formData,'customerId'), year:yearText?Number(yearText):null,
    make:textValue(formData,'make'), model:textValue(formData,'model'), trim:textValue(formData,'trim'),
    vin:textValue(formData,'vin').toUpperCase(), mileage:mileageText?Number(mileageText):null,
  });
  if(!parsed.success) redirect(resultPath(workspaceId,'vehicles','error','Check the vehicle information and try again.'));
  await createVehicleCommand({
    workspaceId,idempotencyKey:randomUUID(),customerId:parsed.data.customerId||null,year:parsed.data.year,
    make:parsed.data.make,model:parsed.data.model,trim:parsed.data.trim||null,vin:parsed.data.vin||null,
    mileage:parsed.data.mileage,mileageUnit:'mi',
  });
  revalidatePath(`/dashboard/${workspaceId}/vehicles`);
  redirect(resultPath(workspaceId,'vehicles','notice','Vehicle created.'));
}

export async function createServiceAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureRole(workspace.role,CATALOG_WRITE);
  const minutes=textValue(formData,'estimatedMinutes'); const price=textValue(formData,'laborPrice');
  const parsed=z.object({
    name:z.string().min(1).max(200),category:z.string().max(120),description:z.string().max(5000),
    estimatedMinutes:z.number().int().min(0).max(10080).nullable(),laborPrice:z.string().regex(/^\d+(\.\d{1,2})?$/),
  }).safeParse({
    name:textValue(formData,'name'),category:textValue(formData,'category'),description:textValue(formData,'description'),
    estimatedMinutes:minutes?Number(minutes):null,laborPrice:price||'0',
  });
  if(!parsed.success) redirect(resultPath(workspaceId,'services','error','Check the service information and try again.'));
  await createServiceCommand({
    workspaceId,idempotencyKey:randomUUID(),name:parsed.data.name,category:parsed.data.category||null,
    description:parsed.data.description||null,estimatedMinutes:parsed.data.estimatedMinutes,laborPrice:parsed.data.laborPrice,isActive:true,
  });
  revalidatePath(`/dashboard/${workspaceId}/services`);
  redirect(resultPath(workspaceId,'services','notice','Service created.'));
}

function timezoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const value=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find((part)=>part.type===type)?.value||0);
  const asUtc=Date.UTC(value('year'),value('month')-1,value('day'),value('hour'),value('minute'),value('second'));
  return asUtc-date.getTime();
}
function localDateTimeInZone(date:string,time:string,timeZone:string){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date); const tm=/^(\d{2}):(\d{2})$/.exec(time);
  if(!match||!tm) throw new Error('Invalid appointment date or time.');
  const base=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(tm[1]),Number(tm[2]));
  let utc=base-timezoneOffsetMs(new Date(base),timeZone);
  utc=base-timezoneOffsetMs(new Date(utc),timeZone);
  return new Date(utc);
}

export async function createAppointmentAction(workspaceId:string,formData:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureRole(workspace.role,STAFF_WRITE);
  const parsed=z.object({
    customerId:z.string().uuid(),vehicleId:z.string().uuid().or(z.literal('')),date:z.string().min(1),time:z.string().min(1),
    duration:z.number().int().min(15).max(1440),notes:z.string().max(5000),
  }).safeParse({
    customerId:textValue(formData,'customerId'),vehicleId:textValue(formData,'vehicleId'),date:textValue(formData,'date'),
    time:textValue(formData,'time'),duration:Number(textValue(formData,'duration')||60),notes:textValue(formData,'notes'),
  });
  if(!parsed.success) redirect(resultPath(workspaceId,'appointments','error','Check the appointment information and try again.'));
  const startsAt=localDateTimeInZone(parsed.data.date,parsed.data.time,workspace.timezone);
  const endsAt=new Date(startsAt.getTime()+parsed.data.duration*60_000);
  await createAppointmentCommand({
    workspaceId,actorUserId:user.id,idempotencyKey:randomUUID(),customerId:parsed.data.customerId,
    vehicleId:parsed.data.vehicleId||null,startsAt,endsAt,source:'staff',notes:parsed.data.notes||null,
  });
  revalidatePath(`/dashboard/${workspaceId}/appointments`);
  redirect(resultPath(workspaceId,'appointments','notice','Appointment created.'));
}
