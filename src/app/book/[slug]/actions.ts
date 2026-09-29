'use server';

import { redirect } from 'next/navigation';

import { createPublicBooking, getPublicBookingContext } from '@/server/booking/public-booking';

function field(data:FormData,key:string){const v=data.get(key);return typeof v==='string'?v.trim():'';}

function offsetMs(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const n=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find(p=>p.type===type)?.value||0);
  return Date.UTC(n('year'),n('month')-1,n('day'),n('hour'),n('minute'),n('second'))-date.getTime();
}
function localDateTime(date:string,time:string,timeZone:string){
  const d=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date),t=/^(\d{2}):(\d{2})$/.exec(time);
  if(!d||!t) throw new Error('Choose a valid date and time.');
  const base=Date.UTC(+d[1],+d[2]-1,+d[3],+t[1],+t[2]);
  let utc=base-offsetMs(new Date(base),timeZone); utc=base-offsetMs(new Date(utc),timeZone);
  return new Date(utc);
}
export async function submitPublicBooking(slug:string,data:FormData){
  const context=await getPublicBookingContext(slug);
  if(!context) redirect('/book/'+slug+'?error='+encodeURIComponent('Online booking is unavailable.'));
  try{
    const startsAt=localDateTime(field(data,'date'),field(data,'time'),context.timezone);
    const partnerId = field(data, 'partnerId');
    const campaignId = field(data, 'campaignId');
    const signature = field(data, 'signature');

    const result = await createPublicBooking({
      slug,
      serviceId: field(data, 'serviceId'),
      firstName: field(data, 'firstName'),
      lastName: field(data, 'lastName'),
      email: field(data, 'email') || null,
      phone: field(data, 'phone') || null,
      year: field(data, 'year') ? Number(field(data, 'year')) : null,
      make: field(data, 'make'),
      model: field(data, 'model'),
      trim: field(data, 'trim') || null,
      vin: field(data, 'vin') || null,
      startsAt,
      notes: field(data, 'notes') || null,
      marketplaceAttribution: partnerId && signature ? { partnerId, campaignId: campaignId || null, signature } : null,
    });
    redirect('/book/'+slug+'/confirmed?code='+encodeURIComponent(result.confirmationCode));
  }catch(error){
    const message=error instanceof Error?error.message:'Booking could not be completed.';
    redirect('/book/'+slug+'?error='+encodeURIComponent(message));
  }
}
