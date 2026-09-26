import { createAppointmentAction } from '../actions';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { listAppointments } from '@/server/repositories/appointments.repository';
import { listCustomers } from '@/server/repositories/customers.repository';
import { listVehicles } from '@/server/repositories/vehicles.repository';

const WRITERS=new Set(['owner','admin','manager','service_advisor','dispatcher','receptionist']);
export const dynamic='force-dynamic';

function dateValue(date:Date,timeZone:string){
  return new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

export default async function AppointmentsPage({params,searchParams}:{params:{workspaceId:string};searchParams?:{notice?:string;error?:string}}){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const now=new Date(); const future=new Date(now.getTime()+90*24*60*60*1000);
  const [appointments,customers,vehicles]=await Promise.all([
    listAppointments(params.workspaceId,{from:new Date(now.getTime()-24*60*60*1000),to:future,limit:100,offset:0}),
    listCustomers(params.workspaceId,{limit:100,offset:0}), listVehicles(params.workspaceId,{limit:100,offset:0}),
  ]);
  const canWrite=WRITERS.has(workspace.role);
  return <main className="content">
    <div className="pageHeader"><h1>Appointments</h1><p>Schedule shown in {workspace.timezone}.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}{searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}
    {canWrite?<section className="card"><h2>Create appointment</h2>
      <form action={createAppointmentAction.bind(null,params.workspaceId)} className="formGrid">
        <label>Customer<select name="customerId" required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select></label>
        <label>Vehicle<select name="vehicleId"><option value="">No vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{[v.year,v.make,v.model].filter(Boolean).join(' ')}{v.customerFirstName?` — ${v.customerFirstName} ${v.customerLastName}`:''}</option>)}</select></label>
        <label>Date<input name="date" type="date" required /></label><label>Start time<input name="time" type="time" required /></label>
        <label>Duration<select name="duration" defaultValue="60"><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label>
        <label className="span2">Notes<textarea name="notes" rows={3} /></label>
        <div className="formActions"><button className="primaryInline" type="submit">Create appointment</button></div>
      </form>
    </section>:null}
    <section className="card tableCard"><div className="tableWrap"><table><thead><tr><th>Date / time</th><th>Customer</th><th>Vehicle</th><th>Status</th><th>Source</th></tr></thead>
    <tbody>{appointments.map(a=><tr key={a.id}><td><strong>{dateValue(a.startsAt,workspace.timezone)}</strong><div className="subtle">to {dateValue(a.endsAt,workspace.timezone)}</div></td>
      <td>{a.customerFirstName} {a.customerLastName}</td><td>{[a.vehicleYear,a.vehicleMake,a.vehicleModel].filter(Boolean).join(' ')||'—'}</td><td>{a.status}</td><td>{a.source}</td></tr>)}</tbody></table></div>
      {appointments.length===0?<div className="emptyState">No upcoming appointments found.</div>:null}</section>
  </main>;
}
