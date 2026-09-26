import Link from 'next/link';

export default function BookingConfirmed({params,searchParams}:{params:{slug:string};searchParams?:{code?:string}}){
  return <main className="loginPage"><section className="loginCard">
    <h1>Appointment requested</h1><p>Your booking request has been received.</p>
    <div className="card"><div className="kicker">Confirmation</div><div className="metric">{searchParams?.code||'Pending'}</div></div>
    <Link className="primaryButton" href={'/book/'+params.slug} style={{display:'block',textAlign:'center',marginTop:16}}>Book another service</Link>
  </section></main>;
}
