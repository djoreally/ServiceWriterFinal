import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { listQuotesDetailed } from '@/server/repositories/billing.repository';
import { decideQuoteAction, issueInvoiceAction, sendQuoteAction } from '../step3-actions';

const WRITERS=new Set(['owner','admin','manager','service_advisor','dispatcher','receptionist']);
export const dynamic='force-dynamic';

export default async function QuotesPage({params,searchParams}:{params:{workspaceId:string};searchParams?:{notice?:string;error?:string}}){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const quotes=await listQuotesDetailed(params.workspaceId,{limit:100,offset:0}); const canWrite=WRITERS.has(workspace.role);
  return <main className="content">
    <div className="pageHeader"><h1>Quotes & Approvals</h1><p>Immutable work-order pricing snapshots with explicit approval state.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}{searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}
    <section className="card tableCard"><div className="tableWrap"><table><thead><tr><th>Quote</th><th>Customer</th><th>Work order</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{quotes.map(q=><tr key={q.id}>
        <td><strong>{q.id.slice(0,8)}</strong><div className="subtle">{q.itemCount} items</div></td>
        <td>{q.customerFirstName} {q.customerLastName}<div className="subtle">{[q.vehicleYear,q.vehicleMake,q.vehicleModel].filter(Boolean).join(' ')}</div></td>
        <td>{q.workOrderNumber?'#'+q.workOrderNumber:'—'}</td><td><strong>${Number(q.total).toFixed(2)}</strong><div className="subtle">Tax ${Number(q.taxTotal).toFixed(2)}</div></td>
        <td>{q.status}</td><td>{canWrite?<div className="actionGroup">
          {q.status==='draft'?<form action={sendQuoteAction.bind(null,params.workspaceId)}><input type="hidden" name="quoteId" value={q.id}/><button type="submit">Send</button></form>:null}
          {q.status==='sent'?<>
            <form action={decideQuoteAction.bind(null,params.workspaceId)}><input type="hidden" name="quoteId" value={q.id}/><input type="hidden" name="decision" value="approved"/><button className="goodButton" type="submit">Approve</button></form>
            <form action={decideQuoteAction.bind(null,params.workspaceId)}><input type="hidden" name="quoteId" value={q.id}/><input type="hidden" name="decision" value="declined"/><button type="submit">Decline</button></form>
          </>:null}
          {q.status==='approved'?<form action={issueInvoiceAction.bind(null,params.workspaceId)}><input type="hidden" name="quoteId" value={q.id}/><button className="primaryInline" type="submit">Issue invoice</button></form>:null}
        </div>:'—'}</td>
      </tr>)}</tbody></table></div>{quotes.length===0?<div className="emptyState">No quotes found. Create one from a work order.</div>:null}</section>
  </main>;
}
