import { z } from "zod";
import { errorResponse, json } from "@/server/api";
import { serviceWriterApi } from "@/server/service-writer-api";

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
const querySchema = z.object({ section: z.enum(["profile", "catalog", "packages", "slots", "blocked_dates", "settings"]).default("profile"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const bookingSlugAliases: Readonly<Record<string, string>> = { moms: "momsoilchange", "moms-mobile-oil-change": "momsoilchange" };
type Requirement = "basic_vehicle" | "oil_fitment" | "tire_fitment" | "tire_quantity" | "detailing_assessment";
type Profile = { workspaceId: string; workspaceSlug: string; displayName: string; timezone: string; currencyCode: string; phone?: string | null; email?: string | null; logoUrl?: string | null; minNoticeMinutes?: number; maxAdvanceDays?: number; defaultSlotMinutes?: number; availabilityWindows?: Array<{dayOfWeek:number;startMinute:number;endMinute:number}>; paymentChoices?: {payNow:boolean;payLater:boolean} };
type Service = { id:string; categoryId?:string|null; name:string; description?:string|null; priceCents:number; laborMinutes:number; taxable:boolean };
type Availability = { localDate:string; bookingEnabled:boolean; defaultSlotMinutes:number; segments:Array<{startMinute:number;endMinute:number}> };
function slugAlias(slug:string){return bookingSlugAliases[slug.toLowerCase()]??slug;}
function hhmm(minute:number){return `${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;}
function requirements(name:string):Requirement[]{const value=name.toLowerCase();const out=new Set<Requirement>(["basic_vehicle"]);if(/oil|lube|fluid/.test(value))out.add("oil_fitment");if(/tire|tyre|wheel|tpms|rotation/.test(value))out.add("tire_fitment");if(/detail|wash|ceramic|coating|wax|polish|interior|exterior/.test(value))out.add("detailing_assessment");return [...out];}

export async function GET(request:Request,context:{params:Promise<{slug:string}>}){
  try{
    const slug=slugAlias(slugSchema.parse((await context.params).slug));
    const url=new URL(request.url);const query=querySchema.parse({section:url.searchParams.get("section")??undefined,date:url.searchParams.get("date")??undefined});
    const profile=await serviceWriterApi<Profile>(request,`/api/v1/public/booking/${slug}/profile`);
    if(query.section==="profile"){
      const windows=profile.availabilityWindows??[];const starts=windows.map(w=>w.startMinute);const ends=windows.map(w=>w.endMinute);const dayNames=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
      return json({data:{user_id:profile.workspaceId,business_name:profile.displayName,booking_slug:profile.workspaceSlug,phone:profile.phone??null,email:profile.email??null,logo_url:profile.logoUrl??null,opening_time:starts.length?hhmm(Math.min(...starts)):null,closing_time:ends.length?hhmm(Math.max(...ends)):null,working_days:[...new Set(windows.map(w=>dayNames[w.dayOfWeek]))],currency:profile.currencyCode,buffer_time_before:0,buffer_time_after:0,min_lead_time_hours:Math.ceil((profile.minNoticeMinutes??0)/60),max_advance_days:profile.maxAdvanceDays??90,slot_duration_minutes:profile.defaultSlotMinutes??30,stripe_charges_enabled:profile.paymentChoices?.payNow??true,require_approval:false}}, {headers:{"Cache-Control":"no-store"}});
    }
    if(query.section==="catalog"){
      const services=await serviceWriterApi<Service[]>(request,`/api/v1/public/booking/${slug}/services`);
      return json({data:services.map(s=>({id:s.id,name:s.name,description:s.description,category_id:s.categoryId,category:null,labor_price:s.priceCents/100,price:s.priceCents/100,estimated_minutes:s.laborMinutes,taxable:s.taxable,is_active:true,booking_requirements:requirements(s.name)}))},{headers:{"Cache-Control":"no-store"}});
    }
    if(query.section==="slots"){
      if(!query.date)return json({error:{code:"invalid_date",message:"date is required for slots"}},{status:400});
      const availability=await serviceWriterApi<Availability>(request,`/api/v1/public/booking/${slug}/availability?date=${query.date}`);
      return json({data:{canonical_availability:true,...availability,slots:availability.segments.map(segment=>({time:hhmm(segment.startMinute),start_minute:segment.startMinute,end_minute:segment.endMinute}))}},{headers:{"Cache-Control":"no-store"}});
    }
    if(query.section==="settings")return json({data:{payment_provider:profile.paymentChoices?.payNow?"stripe":null,square_charges_enabled:false,service_verticals:[]}},{headers:{"Cache-Control":"no-store"}});
    if(query.section==="packages"||query.section==="blocked_dates")return json({data:[]},{headers:{"Cache-Control":"no-store"}});
    return json({data:null},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(error instanceof z.ZodError)return json({error:{code:"invalid_public_booking_request",message:"Invalid public booking request"}},{status:400});
    return errorResponse(error);
  }
}
