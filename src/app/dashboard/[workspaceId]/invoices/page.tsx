import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { getStripeConnection, listInvoicesDetailed } from '@/server/repositories/billing.repository';
import { startStripeCheckoutAction } from '../step3-actions';

const WRITERS=new Set(['owner','admin','manager','service_advisor','dispatcher','receptionist']);
export const dynamic='force-dynamic';

export default async function InvoicesPage({params,searchParams}:{params:{workspaceId:string};searchParams?:{notice?:string;error?:string}}){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const [invoices,stripeConnection]=await Promise.all([listInvoicesDetailed(params.workspaceId,{limit:100,offset:0}),getStripeConnection(params.workspaceId)]); const canWrite=WRITERS.has(workspace.role);
  return <main className="content">
    <div className="pageHeader"><h1>Invoices</h1><p>Issued balances and settlement status.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}{searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}
    {!stripeConnection||stripeConnection.status!=='connected'?<div className="errorBox">Stripe is not connected for this workspace yet. Invoices remain usable, but card payment is unavailable until the provider connection is established.</div>:null}
    <section className="card tableCard"><div className="tableWrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Payment</th></tr></thead>
      <tbody>{invoices.map(invoice=>{
        const balance=Math.max(0,Number(invoice.total)-Number(invoice.amountPaid));
        return <tr key={invoice.id}><td><strong>#{invoice.invoiceNumber}</strong><div className="subtle">{invoice.issuedAt?new Intl.DateTimeFormat('en-US',{timeZone:workspace.timezone,dateStyle:'medium'}).format(invoice.issuedAt):'Not issued'}</div></td>
          <td>{invoice.customerFirstName} {invoice.customerLastName}<div className="subtle">{[invoice.vehicleYear,invoice.vehicleMake,invoice.vehicleModel].filter(Boolean).join(' ')}</div></td>
          <td>${Number(invoice.total).toFixed(2)}</td><td>${Number(invoice.amountPaid).toFixed(2)}</td><td><strong>${balance.toFixed(2)}</strong></td><td>{invoice.status}</td>
          <td>{canWrite && stripeConnection?.status==='connected' && balance>0 && !['void','paid'].includes(invoice.status)?<form action={startStripeCheckoutAction.bind(null,params.workspaceId)}><input type="hidden" name="invoiceId" value={invoice.id}/><button className="primaryInline" type="submit">Pay by card</button></form>:'—'}</td>
        </tr>;
      })}</tbody></table></div>{invoices.length===0?<div className="emptyState">No invoices found. Approve a quote and issue its invoice.</div>:null}</section>
  </main>;
}
