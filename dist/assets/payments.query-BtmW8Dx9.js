import{F as n}from"./index-BxnhNaIA.js";import{c,a as u}from"./financialMath-DwqFa8TV.js";async function l(){const{data:a,error:t}=await n.from("payment_records").select(`
        *,
        appointments (
          title,
          scheduled_date,
          tax_amount,
          status
        )
      `).order("created_at",{ascending:!1});if(t)throw console.error("[fetchPaymentRecords] Error fetching payments",t),new Error("Failed to load payments");return(a||[]).filter(s=>!(s.status==="pending"&&s.appointments?.status==="cancelled")).map(s=>({...s,tax_breakdown:s.tax_breakdown??null}))}async function p(){const{data:{session:a}}=await n.auth.getSession();if(!a)return null;const t=await n.functions.invoke("stripe-connect-status",{headers:{Authorization:`Bearer ${a.access_token}`}});if(t.error)throw console.error("[fetchStripeAccountStatus] Error invoking stripe-connect-status",t.error),new Error("Failed to load Stripe status");return t.data||null}async function f(a){const t=n.from("payment_records").select(`
        id,
        amount,
        currency,
        customer_name,
        customer_email,
        metadata,
        appointment_id,
        user_id,
        status
      `),{data:e}=a.startsWith("cs_")?await t.filter("metadata->>checkout_session_id","eq",a).maybeSingle():await t.eq("id",a).maybeSingle();if(!e)return null;const{data:s}=await n.from("business_profiles").select("business_name").eq("user_id",e.user_id).single();let r;if(e.appointment_id){const{data:i}=await n.from("appointments").select("scheduled_date, scheduled_time, title").eq("id",e.appointment_id).single();r=i??void 0}const o=e.metadata||{};return{businessName:s?.business_name||"Auto Service",customerName:e.customer_name||"Customer",customerEmail:e.customer_email||"",scheduledDate:r?.scheduled_date||o.scheduledDate||"",scheduledTime:r?.scheduled_time||o.scheduledTime||"",serviceName:r?.title||o.serviceName||"Auto Service",amount:c(u(e.amount)),currency:e.currency||"USD",vehicleInfo:o.vehicleInfo,confirmationNumber:e.id.slice(-8).toUpperCase(),status:e.status,userId:e.user_id}}export{l as a,p as b,f};
