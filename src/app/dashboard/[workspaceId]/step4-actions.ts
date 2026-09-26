'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { completeInspection, getWorkOrderInspectionPlan } from '@/server/application/inspections/complete-inspection';
import { completeWorkOrderJob, startWorkOrderJob } from '@/server/application/work-orders/job-lifecycle';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';

const JOB_ROLES=new Set(['owner','admin','manager','service_advisor','technician']);

function field(data:FormData,key:string){const value=data.get(key);return typeof value==='string'?value.trim():'';}
function ensureJobRole(role:string){if(!JOB_ROLES.has(role)) throw new Error('Your workspace role cannot perform technician job actions.');}
function result(workspaceId:string,kind:'notice'|'error',message:string){
  return '/dashboard/'+workspaceId+'/work-orders?'+new URLSearchParams({[kind]:message}).toString();
}
function errorMessage(error:unknown){return error instanceof Error&&error.message?error.message:'The operation could not be completed.';}

export async function startJobAction(workspaceId:string,data:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureJobRole(workspace.role);
  const workOrderId=field(data,'workOrderId');
  try{await startWorkOrderJob({workspaceId,workOrderId,actorUserId:user.id});}
  catch(error){redirect(result(workspaceId,'error',errorMessage(error)));}
  revalidatePath('/dashboard/'+workspaceId+'/work-orders');
  redirect(result(workspaceId,'notice','Job started.'));
}

export async function completeJobAction(workspaceId:string,data:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureJobRole(workspace.role);
  const workOrderId=field(data,'workOrderId');
  try{await completeWorkOrderJob({workspaceId,workOrderId,actorUserId:user.id,workPerformed:field(data,'workPerformed')||null});}
  catch(error){redirect(result(workspaceId,'error',errorMessage(error)));}
  revalidatePath('/dashboard/'+workspaceId+'/work-orders');
  redirect(result(workspaceId,'notice','Job completed.'));
}

export async function submitInspectionAction(workspaceId:string,workOrderId:string,templateId:string,data:FormData){
  const user=await requirePageUser(); const {workspace}=await requirePageWorkspace(user.id,workspaceId); ensureJobRole(workspace.role);
  const plan=await getWorkOrderInspectionPlan(workspaceId,workOrderId);
  if(!plan) redirect(result(workspaceId,'error','Work order not found.'));
  const template=plan.plans.find(item=>item.templateId===templateId);
  if(!template) redirect(result(workspaceId,'error','Inspection template is not required by this work order.'));
  const results=template.items.map(item=>{
    const raw=field(data,'status:'+item.id);
    const status=(['good','attention','urgent','not_applicable'].includes(raw)?raw:'') as 'good'|'attention'|'urgent'|'not_applicable'|'';
    if(item.isRequired&&!status) throw new Error('Complete every required inspection item.');
    return {itemId:item.id,status:status||'not_applicable',notes:field(data,'notes:'+item.id)||null};
  });
  try{
    await completeInspection({
      workspaceId,workOrderId,templateId,actorUserId:user.id,inspectorName:user.email??null,
      notes:field(data,'inspectionNotes')||null,results,
    });
  }catch(error){
    redirect('/dashboard/'+workspaceId+'/work-orders/'+workOrderId+'/inspection?error='+encodeURIComponent(errorMessage(error)));
  }
  revalidatePath('/dashboard/'+workspaceId+'/work-orders/'+workOrderId+'/inspection');
  redirect('/dashboard/'+workspaceId+'/work-orders/'+workOrderId+'/inspection?notice='+encodeURIComponent('Inspection completed.'));
}
