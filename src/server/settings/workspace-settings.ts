import 'server-only';

import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { providerConnections, workspaceSettings, workspaces } from '@/db/schema';

export async function getWorkspaceSettingsView(workspaceId:string){
  const [row]=await getDb().select({
    workspaceId:workspaces.id,name:workspaces.name,timezone:workspaces.timezone,currencyCode:workspaces.currencyCode,
    ownerName:workspaceSettings.ownerName,phone:workspaceSettings.phone,email:workspaceSettings.email,
    addressLine1:workspaceSettings.addressLine1,addressLine2:workspaceSettings.addressLine2,city:workspaceSettings.city,
    region:workspaceSettings.region,postalCode:workspaceSettings.postalCode,countryCode:workspaceSettings.countryCode,
    websiteUrl:workspaceSettings.websiteUrl,bookingSlug:workspaceSettings.bookingSlug,bookingEnabled:workspaceSettings.bookingEnabled,
    openingTime:workspaceSettings.openingTime,closingTime:workspaceSettings.closingTime,workingDays:workspaceSettings.workingDays,
    minLeadTimeHours:workspaceSettings.minLeadTimeHours,maxAdvanceDays:workspaceSettings.maxAdvanceDays,
    slotDurationMinutes:workspaceSettings.slotDurationMinutes,allowCancellation:workspaceSettings.allowCancellation,
    cancellationWindowHours:workspaceSettings.cancellationWindowHours,allowRescheduling:workspaceSettings.allowRescheduling,
    rescheduleWindowHours:workspaceSettings.rescheduleWindowHours,requireApproval:workspaceSettings.requireApproval,
    requireTermsAcceptance:workspaceSettings.requireTermsAcceptance,termsAndConditions:workspaceSettings.termsAndConditions,
    taxRate:workspaceSettings.taxRate,paymentProvider:workspaceSettings.paymentProvider,
  }).from(workspaces)
    .innerJoin(workspaceSettings,eq(workspaceSettings.workspaceId,workspaces.id))
    .where(eq(workspaces.id,workspaceId)).limit(1);
  if(!row) return null;
  const [stripe]=await getDb().select({
    status:providerConnections.status,externalAccountId:providerConnections.externalAccountId,lastSyncedAt:providerConnections.lastSyncedAt,
  }).from(providerConnections).where(and(eq(providerConnections.workspaceId,workspaceId),eq(providerConnections.provider,'stripe'))).limit(1);
  return {...row,stripeConnection:stripe??null};
}
