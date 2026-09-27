import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import {
  customers,
  invoices,
  payments,
  providerConnections,
  quoteItems,
  quotes,
  vehicles,
  workOrderItems,
  workOrders,
} from '@/db/schema';

export async function listWorkOrdersDetailed(workspaceId:string,input:{limit:number;offset:number}){
  return getDb().select({
    id:workOrders.id,number:workOrders.number,status:workOrders.status,priority:workOrders.priority,
    complaint:workOrders.complaint,appointmentId:workOrders.appointmentId,customerId:workOrders.customerId,
    vehicleId:workOrders.vehicleId,updatedAt:workOrders.updatedAt,
    customerFirstName:customers.firstName,customerLastName:customers.lastName,
    vehicleYear:vehicles.year,vehicleMake:vehicles.make,vehicleModel:vehicles.model,
        itemCount:sql<number>`count(${workOrderItems.id})::int`,
        lineTotal:sql<string>`coalesce(sum(${workOrderItems.quantity} * ${workOrderItems.unitPrice}),0)::text`,
  }).from(workOrders)
    .innerJoin(customers,and(eq(customers.workspaceId,workspaceId),eq(customers.id,workOrders.customerId)))
    .leftJoin(vehicles,and(eq(vehicles.workspaceId,workspaceId),eq(vehicles.id,workOrders.vehicleId)))
    .leftJoin(workOrderItems,and(eq(workOrderItems.workspaceId,workspaceId),eq(workOrderItems.workOrderId,workOrders.id)))
    .where(eq(workOrders.workspaceId,workspaceId))
    .groupBy(workOrders.id,customers.id,vehicles.id)
    .orderBy(desc(workOrders.updatedAt)).limit(input.limit).offset(input.offset);
}

export async function listWorkOrderItems(workspaceId:string,workOrderId:string){
  return getDb().select().from(workOrderItems).where(and(
    eq(workOrderItems.workspaceId,workspaceId),eq(workOrderItems.workOrderId,workOrderId),
  )).orderBy(workOrderItems.sortOrder,workOrderItems.createdAt);
}

export async function listQuotesDetailed(workspaceId:string,input:{limit:number;offset:number}){
  return getDb().select({
    id:quotes.id,status:quotes.status,subtotal:quotes.subtotal,taxTotal:quotes.taxTotal,total:quotes.total,
    expiresAt:quotes.expiresAt,workOrderId:quotes.workOrderId,customerId:quotes.customerId,vehicleId:quotes.vehicleId,
    createdAt:quotes.createdAt,updatedAt:quotes.updatedAt,
    customerFirstName:customers.firstName,customerLastName:customers.lastName,
    vehicleYear:vehicles.year,vehicleMake:vehicles.make,vehicleModel:vehicles.model,
    workOrderNumber:workOrders.number,
        itemCount:sql<number>`count(${quoteItems.id})::int`,
  }).from(quotes)
    .innerJoin(customers,and(eq(customers.workspaceId,workspaceId),eq(customers.id,quotes.customerId)))
    .leftJoin(vehicles,and(eq(vehicles.workspaceId,workspaceId),eq(vehicles.id,quotes.vehicleId)))
    .leftJoin(workOrders,and(eq(workOrders.workspaceId,workspaceId),eq(workOrders.id,quotes.workOrderId)))
    .leftJoin(quoteItems,and(eq(quoteItems.workspaceId,workspaceId),eq(quoteItems.quoteId,quotes.id)))
    .where(eq(quotes.workspaceId,workspaceId))
    .groupBy(quotes.id,customers.id,vehicles.id,workOrders.id)
    .orderBy(desc(quotes.updatedAt)).limit(input.limit).offset(input.offset);
}

export async function listInvoicesDetailed(workspaceId:string,input:{limit:number;offset:number}){
  return getDb().select({
    id:invoices.id,invoiceNumber:invoices.invoiceNumber,status:invoices.status,subtotal:invoices.subtotal,
    taxTotal:invoices.taxTotal,total:invoices.total,amountPaid:invoices.amountPaid,dueAt:invoices.dueAt,
    issuedAt:invoices.issuedAt,customerId:invoices.customerId,vehicleId:invoices.vehicleId,workOrderId:invoices.workOrderId,
    customerFirstName:customers.firstName,customerLastName:customers.lastName,
    vehicleYear:vehicles.year,vehicleMake:vehicles.make,vehicleModel:vehicles.model,
  }).from(invoices)
    .innerJoin(customers,and(eq(customers.workspaceId,workspaceId),eq(customers.id,invoices.customerId)))
    .leftJoin(vehicles,and(eq(vehicles.workspaceId,workspaceId),eq(vehicles.id,invoices.vehicleId)))
    .where(eq(invoices.workspaceId,workspaceId))
    .orderBy(desc(invoices.updatedAt)).limit(input.limit).offset(input.offset);
}

export async function listPaymentsDetailed(workspaceId:string,input:{limit:number;offset:number}){
  return getDb().select({
    id:payments.id,status:payments.status,provider:payments.provider,providerPaymentId:payments.providerPaymentId,
    amount:payments.amount,currencyCode:payments.currencyCode,paidAt:payments.paidAt,createdAt:payments.createdAt,
    invoiceId:payments.invoiceId,invoiceNumber:invoices.invoiceNumber,
    customerFirstName:customers.firstName,customerLastName:customers.lastName,
  }).from(payments)
    .leftJoin(invoices,and(eq(invoices.workspaceId,workspaceId),eq(invoices.id,payments.invoiceId)))
    .leftJoin(customers,and(eq(customers.workspaceId,workspaceId),eq(customers.id,payments.customerId)))
    .where(eq(payments.workspaceId,workspaceId))
    .orderBy(desc(payments.createdAt)).limit(input.limit).offset(input.offset);
}


export async function getStripeConnection(workspaceId:string){
  const [connection]=await getDb().select({
    externalAccountId:providerConnections.externalAccountId,
    status:providerConnections.status,
    lastSyncedAt:providerConnections.lastSyncedAt,
  }).from(providerConnections).where(and(
    eq(providerConnections.workspaceId,workspaceId),
    eq(providerConnections.provider,'stripe'),
  )).limit(1);
  return connection??null;
}
