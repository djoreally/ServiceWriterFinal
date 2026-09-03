/** Availability read models shared by public booking and internal scheduling. */
import { productionSupabase as supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface AvailabilitySlot { time: string; available: boolean; }
export interface BookedSlot { id?: string; scheduled_time: string; duration_minutes: number; }

function zonedParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function workspaceLocalToUtc(date: string, time: string, timezone: string): Date {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dm || !tm) throw new Error("Invalid scheduling date/time");
  const target = { year:+dm[1], month:+dm[2], day:+dm[3], hour:+tm[1], minute:+tm[2], second:+(tm[3]||0) };
  const targetUtc = Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second);
  let guess = targetUtc;
  for (let i=0;i<3;i+=1) { const p=zonedParts(guess,timezone); guess += targetUtc-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second); }
  return new Date(guess);
}

/** Public-booking compatibility path keyed by the workspace owner identity. */
export async function fetchBookedSlots(tenantUserId: string, date: string): Promise<BookedSlot[]> {
  const { data, error } = await supabase.rpc("get_booked_slots", { business_user_id: tenantUserId, booking_date: date });
  if (error) throw new Error("Failed to fetch booked slots");
  return (data || []).map((slot: BookedSlot) => ({ id: slot.id, scheduled_time: String(slot.scheduled_time).slice(0,5), duration_minutes: Number(slot.duration_minutes || 60) }));
}

/** Internal scheduler query bounded to one workspace-local day, including overnight overlaps. */
export async function fetchWorkspaceBookedSlots(date: string): Promise<BookedSlot[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before checking availability.");
  const db = supabase as any;
  const { data: workspace, error: workspaceError } = await db.from("workspaces").select("timezone").eq("id",context.workspaceId).maybeSingle();
  if (workspaceError) throw workspaceError;
  const timezone = workspace?.timezone || "UTC";
  const start = workspaceLocalToUtc(date,"00:00:00",timezone);
  const dateObj = new Date(`${date}T00:00:00Z`); dateObj.setUTCDate(dateObj.getUTCDate()+1);
  const nextDate = dateObj.toISOString().slice(0,10);
  const end = workspaceLocalToUtc(nextDate,"00:00:00",timezone);
  const { data: appointments, error } = await db.from("appointments")
    .select("id,starts_at,ends_at,status")
    .eq("workspace_id",context.workspaceId)
    .not("status","in",'("cancelled","no_show")')
    .lt("starts_at",end.toISOString()).gt("ends_at",start.toISOString())
    .order("starts_at",{ascending:true});
  if (error) throw error;
  const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour:"2-digit", minute:"2-digit", hourCycle:"h23" });
  return (appointments || []).map((row:any) => {
    const clampedStart = new Date(Math.max(Date.parse(row.starts_at), start.getTime()));
    const clampedEnd = new Date(Math.min(Date.parse(row.ends_at), end.getTime()));
    return { id: row.id, scheduled_time: timeFormatter.format(clampedStart), duration_minutes: Math.max(1,Math.ceil((clampedEnd.getTime()-clampedStart.getTime())/60000)) };
  });
}

export async function fetchAvailability(tenantUserId:string,date:string,openingTime:string,closingTime:string,slotDuration:number,serviceDuration:number,bufferBefore=0,bufferAfter=0):Promise<AvailabilitySlot[]> {
  const bookedSlots=await fetchBookedSlots(tenantUserId,date); const slots:AvailabilitySlot[]=[];
  const [oh,om]=openingTime.split(":").map(Number), [ch,cm]=closingTime.split(":").map(Number); const openingMinutes=oh*60+om, closingMinutes=ch*60+cm;
  const blockedRanges=bookedSlots.map(slot=>{const [h,m]=slot.scheduled_time.split(":").map(Number); const start=h*60+m; return {start:start-bufferBefore,end:start+slot.duration_minutes+bufferAfter};});
  for(let minutes=openingMinutes;minutes+serviceDuration<=closingMinutes;minutes+=slotDuration){const slotEnd=minutes+serviceDuration; const blocked=blockedRanges.some(r=>minutes<r.end&&slotEnd>r.start); slots.push({time:`${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`,available:!blocked});}
  return slots;
}
