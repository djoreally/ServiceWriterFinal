import { notFound } from 'next/navigation';
import { getPublicBookingContext } from '@/server/booking/public-booking';
import { submitPublicBooking } from './actions';

export const dynamic='force-dynamic';

export default async function PublicBookingPage({params,searchParams}:{params:{slug:string};searchParams?:{error?:string}}){
  const context=await getPublicBookingContext(params.slug);
  if(!context) notFound();
  return <main className="loginPage"><section className="loginCard bookingCard">
    <div className="brand" style={{color:'var(--text)',marginBottom:20}}>Service Writer<small>{context.workspaceName}</small></div>
    <h1>Book service</h1><p>Choose your service and preferred appointment time.</p>
    {searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}
    <form action={submitPublicBooking.bind(null,params.slug)} className="formGrid">
      <label className="span2">Service<select name="serviceId" required><option value="">Select service</option>{context.services.map(s=><option key={s.id} value={s.id}>{s.name} — ${Number(s.laborPrice).toFixed(2)}</option>)}</select></label>
      <label>First name<input name="firstName" required /></label><label>Last name<input name="lastName" required /></label>
      <label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" inputMode="tel" /></label>
      <label>Year<input name="year" type="number" min="1886" max="2100" /></label><label>Make<input name="make" required /></label>
      <label>Model<input name="model" required /></label><label>Trim<input name="trim" /></label>
      <label className="span2">VIN <span className="subtle">(optional)</span><input name="vin" maxLength={17} /></label>
      <label>Date<input name="date" type="date" required /></label><label>Time<input name="time" type="time" required /></label>
      <label className="span2">Notes<textarea name="notes" rows={3}/></label>
      <div className="formActions"><button className="primaryInline" type="submit">Request appointment</button></div>
    </form>
    <p className="subtle">Times are shown in {context.timezone}. Appointment requests are subject to availability.</p>
  </section></main>;
}
