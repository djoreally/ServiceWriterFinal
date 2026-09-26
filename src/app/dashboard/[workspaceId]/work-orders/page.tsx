import Link from 'next/link';
import { listAppointments } from '@/server/repositories/appointments.repository';
import { listCustomers } from '@/server/repositories/customers.repository';
import { listVehicles } from '@/server/repositories/vehicles.repository';
import { listServices } from '@/server/repositories/services.repository';
import { listWorkOrdersDetailed } from '@/server/repositories/billing.repository';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { addServiceToWorkOrderAction, createQuoteAction, createWorkOrderAction } from '../step3-actions';
import { completeJobAction, startJobAction } from '../step4-actions';

const WRITERS=new Set(['owner','admin','manager','service_advisor','dispatcher','receptionist']);
const JOB_ROLES=new Set(['owner','admin','manager','service_advisor','technician']);
export const dynamic='force-dynamic';

export default async function WorkOrdersPage({params,searchParams}:{params:{workspaceId:string};searchParams?:{notice?:string;error?:string}}){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const now=new Date();
  const [orders,appointments,customers,vehicles,services]=await Promise.all([
    listWorkOrdersDetailed(params.workspaceId,{limit:100,offset:0}),
    listAppointments(params.workspaceId,{from:new Date(now.getTime()-30*86400000),to:new Date(now.getTime()+90*86400000),limit:100,offset:0}),
    listCustomers(params.workspaceId,{limit:100,offset:0}),
    listVehicles(params.workspaceId,{limit:100,offset:0}),
    listServices(params.workspaceId,{activeOnly:true,limit:100,offset:0}),
  ]);
  const canWrite=WRITERS.has(workspace.role);
  const canJob=JOB_ROLES.has(workspace.role);

  return <main className="content">
    <div className="pageHeader"><h1>Work Orders</h1><p>Service execution and billable line items for {workspace.name}.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}
    {searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}

    {canWrite?<section className="card">
      <h2>Create work order</h2>
      <form action={createWorkOrderAction.bind(null,params.workspaceId)} className="formGrid">
        <label className="span2">From appointment
          <select name="appointmentId"><option value="">No appointment — create manually</option>
            {appointments.map(a=><option key={a.id} value={a.id}>{new Intl.DateTimeFormat('en-US',{timeZone:workspace.timezone,dateStyle:'short',timeStyle:'short'}).format(a.startsAt)} — {a.customerFirstName} {a.customerLastName} {[a.vehicleYear,a.vehicleMake,a.vehicleModel].filter(Boolean).join(' ')}</option>)}
          </select>
        </label>
        <label>Customer<select name="customerId"><option value="">Select for manual work order</option>{customers.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select></label>
        <label>Vehicle<select name="vehicleId"><option value="">No vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{[v.year,v.make,v.model].filter(Boolean).join(' ')}{v.customerFirstName?' — '+v.customerFirstName+' '+v.customerLastName:''}</option>)}</select></label>
        <label>Priority<select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label className="span2">Customer complaint<textarea name="complaint" rows={3} /></label>
        <div className="formActions"><button className="primaryInline" type="submit">Create work order</button></div>
      </form>
    </section>:null}

    <section className="stack">
      {orders.map(order=><article className="card" key={order.id}>
        <div className="rowBetween">
          <div><div className="kicker">Work order #{order.number}</div><h2 style={{marginBottom:4}}>{order.customerFirstName} {order.customerLastName}</h2>
            <div className="subtle">{[order.vehicleYear,order.vehicleMake,order.vehicleModel].filter(Boolean).join(' ')||'No vehicle'} · {order.status.replaceAll('_',' ')} · {order.priority}</div>
          </div>
          <div className="metricSmall">${Number(order.lineTotal).toFixed(2)}</div>
        </div>
        {order.complaint?<p>{order.complaint}</p>:null}
        <div className="subtle">{order.itemCount} line item{order.itemCount===1?'':'s'}</div>

        {canJob?<div className="inlineActions">
          <div className="actionGroup">
            {!['in_progress','completed','cancelled'].includes(order.status)?<form action={startJobAction.bind(null,params.workspaceId)}><input type="hidden" name="workOrderId" value={order.id}/><button className="goodButton" type="submit">Start job</button></form>:null}
            {order.status==='in_progress'?<Link className="primaryInline" href={'/dashboard/'+params.workspaceId+'/work-orders/'+order.id+'/inspection'}>Inspection</Link>:null}
            {order.status==='in_progress'?<form action={completeJobAction.bind(null,params.workspaceId)}><input type="hidden" name="workOrderId" value={order.id}/><button type="submit">Complete job</button></form>:null}
          </div>
        </div>:null}

        {canWrite && !['completed','cancelled'].includes(order.status)?<div className="inlineActions">
          <form action={addServiceToWorkOrderAction.bind(null,params.workspaceId)} className="inlineForm">
            <input type="hidden" name="workOrderId" value={order.id}/>
            <select name="serviceId" required><option value="">Add service…</option>{services.map(s=><option key={s.id} value={s.id}>{s.name} — ${Number(s.laborPrice).toFixed(2)}</option>)}</select>
            <button type="submit">Add service</button>
          </form>
          {order.itemCount>0?<form action={createQuoteAction.bind(null,params.workspaceId)}>
            <input type="hidden" name="workOrderId" value={order.id}/><button className="primaryInline" type="submit">Create quote</button>
          </form>:null}
        </div>:null}
      </article>)}
      {orders.length===0?<section className="card emptyState">No work orders found.</section>:null}
    </section>
  </main>;
}
