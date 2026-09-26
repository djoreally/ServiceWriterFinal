import { createVehicleAction } from '../actions';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { listCustomers } from '@/server/repositories/customers.repository';
import { listVehicles } from '@/server/repositories/vehicles.repository';

const WRITERS=new Set(['owner','admin','manager','service_advisor','dispatcher','receptionist']);
export const dynamic='force-dynamic';

export default async function VehiclesPage({params,searchParams}:{params:{workspaceId:string};searchParams?:{notice?:string;error?:string}}){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const [vehicles,customers]=await Promise.all([
    listVehicles(params.workspaceId,{limit:100,offset:0}),
    listCustomers(params.workspaceId,{limit:100,offset:0}),
  ]);
  const canWrite=WRITERS.has(workspace.role);
  return <main className="content">
    <div className="pageHeader"><h1>Vehicles</h1><p>{vehicles.length} vehicle{vehicles.length===1?'':'s'} linked to this workspace.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}{searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}
    {canWrite?<section className="card"><h2>Add vehicle</h2>
      <form action={createVehicleAction.bind(null,params.workspaceId)} className="formGrid">
        <label>Customer<select name="customerId"><option value="">Unassigned</option>{customers.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select></label>
        <label>Year<input name="year" type="number" min="1886" max="2100" /></label>
        <label>Make<input name="make" required /></label><label>Model<input name="model" required /></label>
        <label>Trim<input name="trim" /></label><label>VIN<input name="vin" maxLength={17} /></label>
        <label>Mileage<input name="mileage" type="number" min="0" /></label>
        <div className="formActions"><button className="primaryInline" type="submit">Create vehicle</button></div>
      </form>
    </section>:null}
    <section className="card tableCard"><div className="tableWrap"><table><thead><tr><th>Vehicle</th><th>Customer</th><th>VIN</th><th>Mileage</th><th>Status</th></tr></thead>
    <tbody>{vehicles.map(v=><tr key={v.id}><td><strong>{[v.year,v.make,v.model].filter(Boolean).join(' ')||'Unnamed vehicle'}</strong>{v.trim?<div className="subtle">{v.trim}</div>:null}</td>
      <td>{[v.customerFirstName,v.customerLastName].filter(Boolean).join(' ')||'Unassigned'}</td><td>{v.vin||'—'}</td><td>{v.mileage==null?'—':`${v.mileage.toLocaleString()} ${v.mileageUnit}`}</td><td>{v.status}</td></tr>)}</tbody></table></div>
      {vehicles.length===0?<div className="emptyState">No vehicles found.</div>:null}</section>
  </main>;
}
