'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getDb } from '@/db/client';
import { workspaceSettings, workspaces } from '@/db/schema';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';

const SETTINGS_ROLES=new Set(['owner','admin','manager']);
function field(data:FormData,key:string){const v=data.get(key);return typeof v==='string'?v.trim():'';}
function checked(data:FormData,key:string){return data.get(key)==='on';}
function fail(workspaceId:string,message:string){redirect('/dashboard/'+workspaceId+'/settings?error='+encodeURIComponent(message));}

export async function updateWorkspaceSettingsAction(workspaceId:string,data:FormData){
  const user=await requirePageUser();
  const {workspace}=await requirePageWorkspace(user.id,workspaceId);
  if(!SETTINGS_ROLES.has(workspace.role)) fail(workspaceId,'Your workspace role cannot change settings.');

  const bookingSlug=field(data,'bookingSlug').toLowerCase();
  const timezone=field(data,'timezone')||'UTC';
  const currencyCode=(field(data,'currencyCode')||'USD').toUpperCase();
  const taxRate=field(data,'taxRate')||'0';
  const minLead=Number(field(data,'minLeadTimeHours')||2);
  const maxAdvance=Number(field(data,'maxAdvanceDays')||30);
  const slot=Number(field(data,'slotDurationMinutes')||30);
  if(!bookingSlug||!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bookingSlug)) fail(workspaceId,'Booking slug must be 3–63 lowercase letters, numbers, or hyphens.');
  if(!Number.isInteger(minLead)||minLead<0||minLead>720) fail(workspaceId,'Minimum lead time is invalid.');
  if(!Number.isInteger(maxAdvance)||maxAdvance<1||maxAdvance>730) fail(workspaceId,'Maximum advance days is invalid.');
  if(!Number.isInteger(slot)||slot<15||slot>480) fail(workspaceId,'Slot duration is invalid.');
  if(!/^\d+(\.\d{1,4})?$/.test(taxRate)) fail(workspaceId,'Tax rate is invalid.');

  const [duplicate]=await getDb().select({workspaceId:workspaceSettings.workspaceId}).from(workspaceSettings).where(and(
    eq(workspaceSettings.bookingSlug,bookingSlug),ne(workspaceSettings.workspaceId,workspaceId),
  )).limit(1);
  if(duplicate) fail(workspaceId,'That booking slug is already in use.');

  const now=new Date();
  await getDb().transaction(async tx=>{
    await tx.update(workspaces).set({
      name:field(data,'name')||workspace.name,timezone,currencyCode,updatedAt:now,
    }).where(eq(workspaces.id,workspaceId));
    await tx.update(workspaceSettings).set({
      ownerName:field(data,'ownerName')||null,phone:field(data,'phone')||null,email:field(data,'email')||null,
      addressLine1:field(data,'addressLine1')||null,addressLine2:field(data,'addressLine2')||null,
      city:field(data,'city')||null,region:field(data,'region')||null,postalCode:field(data,'postalCode')||null,
      websiteUrl:field(data,'websiteUrl')||null,bookingSlug,bookingEnabled:checked(data,'bookingEnabled'),
      openingTime:field(data,'openingTime')||null,closingTime:field(data,'closingTime')||null,
      minLeadTimeHours:minLead,maxAdvanceDays:maxAdvance,slotDurationMinutes:slot,
      allowCancellation:checked(data,'allowCancellation'),cancellationWindowHours:Number(field(data,'cancellationWindowHours')||24),
      allowRescheduling:checked(data,'allowRescheduling'),rescheduleWindowHours:Number(field(data,'rescheduleWindowHours')||24),
      requireApproval:checked(data,'requireApproval'),requireTermsAcceptance:checked(data,'requireTermsAcceptance'),
      termsAndConditions:field(data,'termsAndConditions')||null,taxRate,paymentProvider:field(data,'paymentProvider')||null,
      updatedAt:now,
    }).where(eq(workspaceSettings.workspaceId,workspaceId));
  });
  revalidatePath('/dashboard/'+workspaceId+'/settings');
  redirect('/dashboard/'+workspaceId+'/settings?notice='+encodeURIComponent('Settings saved.'));
}
