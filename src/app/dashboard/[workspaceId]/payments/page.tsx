import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { listPaymentsDetailed } from '@/server/repositories/billing.repository';

export const dynamic='force-dynamic';

export default async function PaymentsPage({params,searchParams}:{params:{workspaceId:string};searchParams?:{notice?:string;error?:string}}){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const payments=await listPaymentsDetailed(params.workspaceId,{limit:100,offset:0});
  return <main className="content">
    <div className="pageHeader"><h1>Payments</h1><p>Settlements recorded only after verified provider confirmation.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}{searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}
    <section className="card tableCard"><div className="tableWrap"><table><thead><tr><th>Payment</th><th>Invoice</th><th>Customer</th><th>Provider</th><th>Amount</th><th>Status</th><th>Paid</th></tr></thead>
      <tbody>{payments.map(p=><tr key={p.id}><td><strong>{p.id.slice(0,8)}</strong><div className="subtle">{p.providerPaymentId||'—'}</div></td>
        <td>{p.invoiceNumber?'#'+p.invoiceNumber:'—'}</td><td>{[p.customerFirstName,p.customerLastName].filter(Boolean).join(' ')||'—'}</td><td>{p.provider||'—'}</td>
        <td>{p.currencyCode} {Number(p.amount).toFixed(2)}</td><td>{p.status}</td><td>{p.paidAt?new Intl.DateTimeFormat('en-US',{timeZone:workspace.timezone,dateStyle:'medium',timeStyle:'short'}).format(p.paidAt):'—'}</td>
      </tr>)}</tbody></table></div>{payments.length===0?<div className="emptyState">No successful payments recorded yet.</div>:null}</section>
  </main>;
}
