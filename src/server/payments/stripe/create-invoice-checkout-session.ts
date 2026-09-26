import 'server-only';

import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { invoices, providerConnections, workspaces } from '@/db/schema';
import { getStripeClient } from '@/server/payments/stripe/client';

function decimalToMinor(value:string){
  const [whole,fraction='']=value.split('.');
  return Number(whole)*100+Number((fraction+'00').slice(0,2));
}
function applicationFeeBps(metadata:unknown){
  if(!metadata||typeof metadata!=='object') return 0;
  const candidate=metadata as Record<string,unknown>;
  const raw=candidate.applicationFeeBps??candidate.application_fee_bps??0;
  const value=typeof raw==='number'?raw:Number(raw);
  return Number.isInteger(value)&&value>=0&&value<=10000?value:0;
}

export async function createStripeInvoiceCheckoutSession(input:{
  workspaceId:string;
  invoiceId:string;
  successUrl:string;
  cancelUrl:string;
  idempotencyKey:string;
}){
  const [context]=await getDb().select({
    invoiceStatus:invoices.status,total:invoices.total,amountPaid:invoices.amountPaid,
    invoiceNumber:invoices.invoiceNumber,workspaceCurrency:workspaces.currencyCode,workspaceName:workspaces.name,
    stripeAccountId:providerConnections.externalAccountId,connectionStatus:providerConnections.status,
    connectionMetadata:providerConnections.metadata,
  }).from(invoices)
    .innerJoin(workspaces,eq(workspaces.id,invoices.workspaceId))
    .innerJoin(providerConnections,and(
      eq(providerConnections.workspaceId,invoices.workspaceId),
      eq(providerConnections.provider,'stripe'),
    ))
    .where(and(eq(invoices.workspaceId,input.workspaceId),eq(invoices.id,input.invoiceId))).limit(1);

  if(!context||!context.stripeAccountId) throw Object.assign(new Error('This workspace does not have a Stripe account connected'),{status:409,code:'stripe_account_not_connected'});
  if(context.connectionStatus!=='connected') throw Object.assign(new Error('The Stripe connection is not active'),{status:409,code:'stripe_connection_inactive'});
  if(context.invoiceStatus==='void'||context.invoiceStatus==='paid') throw Object.assign(new Error('This invoice cannot accept another payment'),{status:409,code:'invoice_not_payable'});

  const amountMinor=decimalToMinor(context.total)-decimalToMinor(context.amountPaid);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0) throw Object.assign(new Error('Invoice balance is not payable'),{status:409,code:'invoice_balance_invalid'});

  const stripe=getStripeClient();
  const account=await stripe.accounts.retrieve(context.stripeAccountId);
  if(!account.charges_enabled||!account.details_submitted) throw Object.assign(new Error('The connected shop Stripe account is not ready to accept charges'),{status:409,code:'stripe_account_not_ready'});

  const feeBps=applicationFeeBps(context.connectionMetadata);
  const applicationFeeAmount=Math.floor((amountMinor*feeBps)/10000);
  const session=await stripe.checkout.sessions.create({
    mode:'payment',
    success_url:input.successUrl,
    cancel_url:input.cancelUrl,
    line_items:[{
      quantity:1,
      price_data:{
        currency:context.workspaceCurrency.toLowerCase(),
        unit_amount:amountMinor,
        product_data:{name:'Invoice #'+String(context.invoiceNumber),description:context.workspaceName},
      },
    }],
    payment_intent_data:{
      application_fee_amount:applicationFeeAmount>0?applicationFeeAmount:undefined,
      metadata:{workspace_id:input.workspaceId,invoice_id:input.invoiceId,invoice_number:String(context.invoiceNumber)},
    },
    metadata:{workspace_id:input.workspaceId,invoice_id:input.invoiceId},
  },{
    stripeAccount:context.stripeAccountId,
    idempotencyKey:'service-writer-checkout:'+input.workspaceId+':'+input.invoiceId+':'+input.idempotencyKey,
  });

  if(!session.url) throw Object.assign(new Error('Stripe did not return a hosted checkout URL'),{status:502,code:'stripe_checkout_url_missing'});
  return {checkoutUrl:session.url,sessionId:session.id,amountMinor,currency:context.workspaceCurrency};
}
