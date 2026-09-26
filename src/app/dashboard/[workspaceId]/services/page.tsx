import { createServiceAction } from '../actions';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { listServices } from '@/server/repositories/services.repository';

const WRITERS=new Set(['owner','admin','manager','service_advisor']);
export const dynamic='force-dynamic';

export default async function ServicesPage({params,searchParams}:{params:{workspaceId:string};searchParams?:{notice?:string;error?:string}}){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const services=await listServices(params.workspaceId,{activeOnly:false,limit:100,offset:0});
  const canWrite=WRITERS.has(workspace.role);
  return <main className="content">
    <div className="pageHeader"><h1>Service Catalog</h1><p>Server-owned pricing and service definitions for {workspace.name}.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}{searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}
    {canWrite?<section className="card"><h2>Add service</h2>
      <form action={createServiceAction.bind(null,params.workspaceId)} className="formGrid">
        <label>Service name<input name="name" required /></label><label>Category<input name="category" /></label>
        <label>Labor price<input name="laborPrice" inputMode="decimal" defaultValue="0.00" required /></label>
        <label>Estimated minutes<input name="estimatedMinutes" type="number" min="0" /></label>
        <label className="span2">Description<textarea name="description" rows={3} /></label>
        <div className="formActions"><button className="primaryInline" type="submit">Create service</button></div>
      </form>
    </section>:null}
    <section className="card tableCard"><div className="tableWrap"><table><thead><tr><th>Service</th><th>Category</th><th>Price</th><th>Duration</th><th>Status</th></tr></thead>
    <tbody>{services.map(s=><tr key={s.id}><td><strong>{s.name}</strong>{s.description?<div className="subtle">{s.description}</div>:null}</td><td>{s.category||'—'}</td>
      <td>${Number(s.laborPrice).toFixed(2)}</td><td>{s.estimatedMinutes==null?'—':`${s.estimatedMinutes} min`}</td><td>{s.isActive?'Active':'Inactive'}</td></tr>)}</tbody></table></div>
      {services.length===0?<div className="emptyState">No services found.</div>:null}</section>
  </main>;
}
