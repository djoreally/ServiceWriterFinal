import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase=createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false}},
);

type QueueMessage={msg_id:number;read_ct:number;message:{outbox_id?:string}};
type PushRow={
  id:string;notification_id:string;subscription_id:string;attempts:number;
  title:string;message:string;metadata:Record<string,unknown>|null;
  endpoint:string;p256dh:string;auth_key:string;
};

const configured=()=>Boolean(
  Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY")?.trim() &&
  Deno.env.get("VAPID_PRIVATE_KEY")?.trim()
);

const retrySeconds=(attempts:number)=>Math.min(86400,30*2**Math.min(attempts,8));

function notificationUrl(metadata:Record<string,unknown>|null){
  const url=metadata?.url;
  return typeof url==="string"&&url.startsWith("/")?url:"/tech-app";
}

function configureVapid(){
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")?.trim()||"mailto:security@servicewriter.xyz",
    Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY")!.trim(),
    Deno.env.get("VAPID_PRIVATE_KEY")!.trim(),
  );
}

Deno.serve(async(req)=>{
  if(req.method!=="POST") return Response.json({ok:false,error:"method_not_allowed"},{status:405});
  if(!configured()) return Response.json({ok:false,error:"worker_not_configured"},{status:503});

  configureVapid();
  const workerId=`supabase:push:${crypto.randomUUID()}`;
  const started=Date.now();
  const read=await supabase.rpc("read_push_queue_v1",{p_visibility_seconds:120,p_limit:5});
  if(read.error) return Response.json({ok:false,error:"queue_read_failed"},{status:500});

  let sent=0,failed=0,skipped=0,staleSubscriptions=0;
  for(const msg of (read.data??[]) as QueueMessage[]){
    const outboxId=msg.message?.outbox_id;
    if(!outboxId){
      await supabase.rpc("archive_push_queue_v1",{p_msg_id:msg.msg_id});
      skipped++;
      continue;
    }

    const claimed=await supabase.rpc("claim_push_event_by_id_v1",{p_id:outboxId,p_worker_id:workerId});
    if(claimed.error){
      failed++;
      await supabase.rpc("defer_push_queue_v1",{p_msg_id:msg.msg_id,p_seconds:300});
      continue;
    }

    const row=(claimed.data?.[0]??null) as PushRow|null;
    if(!row){
      await supabase.rpc("archive_push_queue_v1",{p_msg_id:msg.msg_id});
      skipped++;
      continue;
    }

    try{
      await webpush.sendNotification(
        {endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth_key}},
        JSON.stringify({
          title:row.title,
          body:row.message,
          tag:`notification:${row.notification_id}`,
          url:notificationUrl(row.metadata),
        }),
        {TTL:300,urgency:"high"},
      );

      const complete=await supabase.rpc("complete_in_app_push_outbox",{
        p_id:row.id,p_worker_id:workerId,p_sent:true,p_error:null,p_retry_seconds:300,
      });
      if(complete.error) throw complete.error;
      await supabase.rpc("archive_push_queue_v1",{p_msg_id:msg.msg_id});
      sent++;
    }catch(error){
      const statusCode=typeof error==="object"&&error!==null&&"statusCode" in error
        ? Number((error as {statusCode?:number}).statusCode)
        : 0;

      if(statusCode===404||statusCode===410){
        const disabled=await supabase.from("tech_push_subscriptions")
          .update({disabled_at:new Date().toISOString()})
          .eq("id",row.subscription_id);
        if(disabled.error) console.error("[PushWorker] failed to disable stale subscription",{subscriptionId:row.subscription_id});
        staleSubscriptions++;
      }

      const errorCode=statusCode===404||statusCode===410?"subscription_gone":error instanceof Error?error.message:"push_delivery_failed";
      const retry=retrySeconds(row.attempts);
      await supabase.rpc("complete_in_app_push_outbox",{
        p_id:row.id,p_worker_id:workerId,p_sent:false,p_error:errorCode,p_retry_seconds:retry,
      });
      await supabase.rpc("defer_push_queue_v1",{p_msg_id:msg.msg_id,p_seconds:retry});
      failed++;
    }
  }

  return Response.json({
    ok:true,
    processed:(read.data??[]).length,
    sent,failed,skipped,staleSubscriptions,
    durationMs:Date.now()-started,
  });
});
