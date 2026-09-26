import Link from 'next/link';

import { getWorkOrderInspectionPlan } from '@/server/application/inspections/complete-inspection';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { submitInspectionAction } from '../../../step4-actions';

const JOB_ROLES=new Set(['owner','admin','manager','service_advisor','technician']);
export const dynamic='force-dynamic';

export default async function InspectionPage({
  params,
  searchParams,
}:{
  params:{workspaceId:string;workOrderId:string};
  searchParams?:{notice?:string;error?:string};
}){
  const user=await requirePageUser();
  const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const plan=await getWorkOrderInspectionPlan(params.workspaceId,params.workOrderId);
  if(!plan) return <main className="content"><div className="errorBox">Work order not found.</div></main>;
  const canInspect=JOB_ROLES.has(workspace.role);

  return <main className="content">
    <div className="pageHeader">
      <h1>Inspection</h1>
      <p>Complete every required inspection before job completion.</p>
    </div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}
    {searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}
    <div style={{marginBottom:16}}><Link href={'/dashboard/'+params.workspaceId+'/work-orders'}>← Back to work orders</Link></div>

    {plan.plans.length===0?<section className="card"><h2>No inspection required</h2><p className="subtle">None of this work order's services require an inspection template.</p></section>:null}

    <section className="stack">
      {plan.plans.map(template=><article className="card" key={template.templateId}>
        <div className="rowBetween">
          <div><div className="kicker">{template.serviceName}</div><h2>{template.templateName}</h2></div>
          <div>{template.completed?<span className="noticeBox" style={{display:'inline-block',margin:0}}>Completed</span>:<span className="subtle">Pending</span>}</div>
        </div>

        {!template.completed&&canInspect?<form action={submitInspectionAction.bind(null,params.workspaceId,params.workOrderId,template.templateId)}>
          <div className="inspectionList">
            {template.items.map(item=><div className="inspectionItem" key={item.id}>
              <div><strong>{item.name}</strong>{item.description?<div className="subtle">{item.description}</div>:null}{item.isRequired?<div className="subtle">Required</div>:null}</div>
              <select name={'status:'+item.id} required={item.isRequired} defaultValue="">
                <option value="">Select result</option>
                <option value="good">Pass</option>
                <option value="attention">Needs attention</option>
                <option value="urgent">Fail</option>
                <option value="not_applicable">Not applicable</option>
              </select>
              <input name={'notes:'+item.id} placeholder="Notes" />
            </div>)}
          </div>
          <label style={{display:'grid',gap:6,marginTop:16}}>Inspection notes<textarea name="inspectionNotes" rows={3}/></label>
          <div className="formActions" style={{marginTop:16}}><button className="primaryInline" type="submit">Complete inspection</button></div>
        </form>:null}
      </article>)}
    </section>
  </main>;
}
