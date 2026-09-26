import { createCustomerAction } from '../actions';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { listCustomers } from '@/server/repositories/customers.repository';

const WRITERS=new Set(['owner','admin','manager','service_advisor','dispatcher','receptionist']);

export const dynamic='force-dynamic';

export default async function CustomersPage({params,searchParams}:{params:{workspaceId:string};searchParams?:{q?:string;notice?:string;error?:string}}){
  const user=await requirePageUser();
  const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const customers=await listCustomers(params.workspaceId,{search:searchParams?.q,limit:100,offset:0});
  const canWrite=WRITERS.has(workspace.role);

  return <main className="content">
    <div className="pageHeader"><h1>Customers</h1><p>{customers.length} active customer{customers.length===1?'':'s'} in {workspace.name}.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}
    {searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}

    <section className="toolbar">
      <form method="get" className="searchForm">
        <input name="q" defaultValue={searchParams?.q||''} placeholder="Search name, email, or phone" />
        <button type="submit">Search</button>
      </form>
    </section>

    {canWrite?<section className="card">
      <h2>Add customer</h2>
      <form action={createCustomerAction.bind(null,params.workspaceId)} className="formGrid">
        <label>First name<input name="firstName" required /></label>
        <label>Last name<input name="lastName" required /></label>
        <label>Email<input name="email" type="email" /></label>
        <label>Phone<input name="phone" inputMode="tel" /></label>
        <label>Company<input name="companyName" /></label>
        <label>City<input name="city" /></label>
        <label>State / region<input name="region" /></label>
        <div className="formActions"><button className="primaryInline" type="submit">Create customer</button></div>
      </form>
    </section>:null}

    <section className="card tableCard">
      <div className="tableWrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Location</th><th>Status</th></tr></thead>
      <tbody>{customers.map((customer)=><tr key={customer.id}>
        <td><strong>{customer.firstName} {customer.lastName}</strong>{customer.companyName?<div className="subtle">{customer.companyName}</div>:null}</td>
        <td>{customer.phone||'—'}</td><td>{customer.email||'—'}</td>
        <td>{[customer.city,customer.region].filter(Boolean).join(', ')||'—'}</td><td>{customer.status}</td>
      </tr>)}</tbody></table></div>
      {customers.length===0?<div className="emptyState">No customers found.</div>:null}
    </section>
  </main>;
}
