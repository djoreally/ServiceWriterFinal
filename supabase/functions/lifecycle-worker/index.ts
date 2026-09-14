import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase=createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false}},
);

type QueueMessage={msg_id:number;read_ct:number;message:{outbox_id?:string}};
type Outbox={
  id:string;workspace_id:string;event_key:string;recipient_email:string|null;
  recipient_role:string;idempotency_key:string;attempts:number;
  payload:{
    customerId?:string|null;metadata?:Record<string,string>;
    renderedSubject?:string;renderedText?:string;renderedHtml?:string;
    renderedPurpose?:string;fromName?:string;replyTo?:string|null;
  };
};

const configured=()=>Boolean(Deno.env.get("RESEND_API_KEY")?.trim()&&Deno.env.get("RESEND_FROM_EMAIL")?.trim());
const retrySeconds=(attempts:number)=>Math.min(86400,30*2**Math.min(attempts,8));

async function sendResend(row:Outbox){
  const p=row.payload??{};
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${Deno.env.get("RESEND_API_KEY")!.trim()}`,
      "Content-Type":"application/json",
      "Idempotency-Key":row.idempotency_key,
    },
    body:JSON.stringify({
      from:`${p.fromName||"Service Writer"} <${Deno.env.get("RESEND_FROM_EMAIL")!.trim()}>`,
      to:[row.recipient_email],
      subject:p.renderedSubject||row.event_key,
      html:p.renderedHtml,
      text:p.renderedText,
      reply_to:p.replyTo||undefined,
      headers:{"X-Workspace-ID":row.workspace_id},
    }),
  });
  const body=await response.json().catch(()=>({})) as {id?:string;message?:string};
  if(!response.ok||!body.id) throw new Error(body.message||`resend_http_${response.status}`);
  return body.id;
}

Deno.serve(async(req)=>{
  if(req.method!=="POST") return Response.json({ok:false,error:"method_not_allowed"},{status:405});
  if(!configured()) return Response.json({ok:false,error:"worker_not_configured"},{status:503});

  const workerId=`supabase:lifecycle:${crypto.randomUUID()}`;
  const started=Date.now();
  const read=await supabase.rpc("read_lifecycle_queue_v1",{p_visibility_seconds:120,p_limit:5});
  if(read.error) return Response.json({ok:false,error:"queue_read_failed"},{status:500});

  let sent=0,failed=0,skipped=0;
  for(const msg of (read.data??[]) as QueueMessage[]){
    const outboxId=msg.message?.outbox_id;
    if(!outboxId){await supabase.rpc("archive_lifecycle_queue_v1",{p_msg_id:msg.msg_id});skipped++;continue;}

    const claimed=await supabase.rpc("claim_lifecycle_event_by_id_v1",{p_id:outboxId,p_worker_id:workerId});
    if(claimed.error){failed++;await supabase.rpc("defer_lifecycle_queue_v1",{p_msg_id:msg.msg_id,p_seconds:300});continue;}
    const row=(claimed.data?.[0]??null) as Outbox|null;
    if(!row){skipped++;await supabase.rpc("archive_lifecycle_queue_v1",{p_msg_id:msg.msg_id});continue;}

    try{
      if(!row.recipient_email) throw new Error("missing_recipient");
      const purpose=row.payload?.renderedPurpose||"transactional";

      const existing=await supabase.from("message_logs")
        .select("id,provider_message_id,status")
        .eq("workspace_id",row.workspace_id)
        .eq("idempotency_key",row.idempotency_key)
        .maybeSingle();
      if(existing.error) throw existing.error;
      if(existing.data?.provider_message_id&&["accepted","sent","delivered"].includes(existing.data.status)){
        await supabase.rpc("complete_lifecycle_event",{p_id:row.id,p_worker_id:workerId,p_sent:true,p_error:null,p_retry_seconds:300});
        await supabase.rpc("archive_lifecycle_queue_v1",{p_msg_id:msg.msg_id});
        sent++;continue;
      }

      const suppression=await supabase.rpc("messaging_has_active_suppression",{
        target_workspace_id:row.workspace_id,target_channel:"email",target_purpose:purpose,
        target_email:row.recipient_email,target_phone:null,
      });
      if(suppression.error) throw suppression.error;

      let consentGranted=true;
      if(purpose==="marketing"){
        const consent=await supabase.from("messaging_consents").select("status")
          .eq("workspace_id",row.workspace_id).eq("channel","email").eq("purpose","marketing")
          .eq("contact_email",row.recipient_email).order("updated_at",{ascending:false}).limit(1).maybeSingle();
        if(consent.error) throw consent.error;
        consentGranted=consent.data?.status==="granted";
      }

      const checkedAt=new Date().toISOString();
      if(Boolean(suppression.data)||!consentGranted){
        const canceled=await supabase.from("message_logs").upsert({
          workspace_id:row.workspace_id,customer_id:row.payload?.customerId??null,channel:"email",
          purpose,provider:"resend",idempotency_key:row.idempotency_key,recipient_email:row.recipient_email,
          template_key:row.event_key,subject:row.payload?.renderedSubject??row.event_key,
          body_redacted:(row.payload?.renderedText??"").slice(0,240),status:"canceled",
          failure_code:!consentGranted?"consent_required":"suppressed",
          failure_reason:!consentGranted?"Marketing consent is not granted":"Recipient is actively suppressed",
          consent_checked_at:checkedAt,suppression_checked_at:checkedAt,metadata:row.payload?.metadata??{},
        },{onConflict:"workspace_id,idempotency_key"});
        if(canceled.error) throw canceled.error;
        await supabase.rpc("complete_lifecycle_event",{p_id:row.id,p_worker_id:workerId,p_sent:true,p_error:null,p_retry_seconds:300});
        await supabase.rpc("archive_lifecycle_queue_v1",{p_msg_id:msg.msg_id});
        skipped++;continue;
      }

      const queued=await supabase.from("message_logs").upsert({
        workspace_id:row.workspace_id,customer_id:row.payload?.customerId??null,channel:"email",
        purpose,provider:"resend",idempotency_key:row.idempotency_key,recipient_email:row.recipient_email,
        template_key:row.event_key,subject:row.payload?.renderedSubject??row.event_key,
        body_redacted:(row.payload?.renderedText??"").slice(0,240),status:"queued",
        consent_checked_at:checkedAt,suppression_checked_at:checkedAt,metadata:row.payload?.metadata??{},
      },{onConflict:"workspace_id,idempotency_key"}).select("id").single();
      if(queued.error) throw queued.error;

      const providerMessageId=await sendResend(row);
      const acceptedAt=new Date().toISOString();
      const updated=await supabase.from("message_logs").update({
        provider:"resend",provider_message_id:providerMessageId,status:"accepted",sent_at:acceptedAt,
        failure_code:null,failure_reason:null,failed_at:null,
      }).eq("id",queued.data.id);
      if(updated.error) throw updated.error;

      const complete=await supabase.rpc("complete_lifecycle_event",{
        p_id:row.id,p_worker_id:workerId,p_sent:true,p_error:null,p_retry_seconds:300,
      });
      if(complete.error) throw complete.error;
      await supabase.rpc("archive_lifecycle_queue_v1",{p_msg_id:msg.msg_id});
      sent++;
    }catch(error){
      const backoff=retrySeconds(row.attempts);
      await supabase.rpc("complete_lifecycle_event",{
        p_id:row.id,p_worker_id:workerId,p_sent:false,
        p_error:error instanceof Error?error.message:"lifecycle_delivery_failed",
        p_retry_seconds:backoff,
      });
      await supabase.rpc("defer_lifecycle_queue_v1",{p_msg_id:msg.msg_id,p_seconds:backoff});
      failed++;
    }
  }

  return Response.json({ok:true,processed:(read.data??[]).length,sent,failed,skipped,durationMs:Date.now()-started});
});
