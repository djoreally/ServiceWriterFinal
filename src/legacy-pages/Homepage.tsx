import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CarFront, Check, ClipboardList, CreditCard, FileText, ShieldCheck, Sparkles, Users, Wrench } from "lucide-react";
import { MarketingLayout, NeoCard, PRIMARY, PRIMARY_CONTAINER, hardShadow, hardShadowLg, hankenStack, monoStack, neoBtn } from "@/components/marketing/MarketingLayout";

const FREE_CORE = [
  "Public booking and manual appointments", "Unlimited customers and vehicles", "VIN, notes, and service history", "Estimates and customer approvals", "Appointments, service jobs, and service records", "Invoices and payment recording", "Daily calendar and technician assignment", "Technician checklists and job status", "Service library and labor configuration", "Basic fleet customer and vehicle workflows", "Unlimited technicians, advisors, and admins", "Standard transactional emails",
];
const VALUE_ADD = [
  "Automated service reminders", "Loyalty and rewards", "Two-way SMS and re-engagement campaigns", "Review generation and marketing automation", "AI and workflow automation", "Marketplace and co-op customer acquisition", "Route optimization and live customer tracking", "Advanced fleet PM and manager portal", "Advanced analytics, commissions, and permissions", "Parts and distributor integrations",
];
const FLOW = [
  ["01", "Request", "Customer books, calls, or the office creates the appointment."],
  ["02", "Vehicle", "Keep the exact vehicle, VIN, mileage, service, and history attached to the job."],
  ["03", "Approve", "Build the estimate and capture customer authorization before work begins."],
  ["04", "Start Job", "Verify VIN and mileage, then begin the service-specific inspection immediately."],
  ["05", "Inspect", "Record condition, notes, and findings while the scheduled service is underway."],
  ["06", "Recommend", "Turn a finding into priced additional work for that exact vehicle."],
  ["07", "Authorize", "Customer approves or declines without mixing work between vehicles."],
  ["08", "Complete", "Finish scheduled and approved work or clearly record what could not be completed."],
  ["09", "Checkout", "Invoice, reconcile prepaid amounts, collect payment, and issue the receipt."],
  ["10", "Retain", "Preserve service history and use it for reminders, loyalty, and future service."],
];

function useHomepageMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Service Writer | Run Your Shop for Free";
    const description = "Free automotive service software for independent shops and mobile mechanics. Run customers, vehicles, estimates, approvals, scheduling, jobs, invoices, payments, technicians, and service history without per-seat limits.";
    const setMeta = (selector: string, attr: string, name: string, content: string) => { let node = document.head.querySelector(selector) as HTMLMetaElement | null; if (!node) { node = document.createElement("meta"); node.setAttribute(attr, name); document.head.appendChild(node); } node.setAttribute("content", content); };
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", "Service Writer | Running your shop shouldn't be the premium feature.");
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    return () => { document.title = previousTitle; };
  }, []);
}

export default function Homepage() {
  useHomepageMeta();
  return <MarketingLayout>
    <header className="max-w-5xl mx-auto text-center pt-8 md:pt-16 mb-24 md:mb-32">
      <div className="inline-flex items-center gap-2 border-[3px] border-black bg-white px-4 py-2 mb-7" style={hardShadow}><Wrench className="w-4 h-4" strokeWidth={3}/><span className="uppercase text-[10px] tracking-widest" style={{...monoStack,color:PRIMARY}}>Service Writer / Free Operational Core</span></div>
      <h1 className="font-black mb-7" style={{...hankenStack,fontSize:"clamp(46px, 8vw, 88px)",lineHeight:.98,letterSpacing:"-0.055em"}}>Running your shop shouldn't be the premium feature.</h1>
      <p className="text-lg md:text-2xl max-w-3xl mx-auto mb-9" style={{color:"#4b4b4b",lineHeight:1.55}}>Service Writer gives independent shops and mobile mechanics the operational system to run a job from customer to payment — free. No customer limits. No vehicle limits. No per-technician tax.</p>
      <div className="flex flex-col sm:flex-row justify-center gap-3"><Link to="/signup" className={neoBtn} style={{backgroundColor:PRIMARY_CONTAINER,...hardShadow}}>Start free <ArrowRight className="w-4 h-4"/></Link><a href="#free-core" className={neoBtn} style={{backgroundColor:"#fff",...hardShadow}}>See what's free</a></div>
      <p className="mt-5 text-xs uppercase tracking-wider" style={{...monoStack,color:"#666"}}>Start operating first. Add growth tools when they create value.</p>
    </header>

    <section className="mb-24 md:mb-32">
      <div className="flex items-center gap-4 mb-9"><h2 className="uppercase tracking-widest text-white bg-black px-5 py-2 text-xl md:text-2xl font-black" style={hankenStack}>One complete job</h2><div className="h-[4px] flex-grow bg-black"/></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">{FLOW.map(([number,title,copy])=><article key={number} className="border-[4px] border-black bg-white p-5" style={hardShadow}><span className="text-3xl font-black" style={{...monoStack,color:PRIMARY}}>{number}</span><h3 className="text-xl font-black mt-5 mb-2" style={hankenStack}>{title}</h3><p className="text-sm text-neutral-600 leading-relaxed">{copy}</p></article>)}</div>
      <div className="mt-7 border-[4px] border-black p-5 md:p-7 text-center" style={{backgroundColor:PRIMARY_CONTAINER,...hardShadow}}><p className="font-black text-xl md:text-3xl" style={hankenStack}>Request → Appointment → Vehicle → Start Job → Inspection → Recommendation → Authorization → Service → Invoice → Payment → History</p></div>
    </section>

    <section id="free-core" className="mb-24 md:mb-32 grid lg:grid-cols-2 gap-7 items-stretch">
      <div className="border-[4px] border-black bg-white p-6 md:p-9" style={hardShadowLg}><div className="flex items-center gap-3 mb-3"><ShieldCheck className="w-8 h-8"/><span className="uppercase text-xs tracking-widest" style={{...monoStack,color:PRIMARY}}>Free / $0 workspace</span></div><h2 className="text-4xl md:text-6xl font-black mb-5" style={{...hankenStack,letterSpacing:"-0.04em",lineHeight:1}}>The operational core is free.</h2><p className="text-lg text-neutral-600 leading-relaxed mb-7">If a feature is required to complete the everyday service workflow, it belongs in the foundation — not behind an artificial seat, customer, vehicle, or repair-order limit.</p><div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">{FREE_CORE.map(item=><div key={item} className="flex gap-2 items-start"><Check className="w-5 h-5 shrink-0 mt-0.5" style={{color:PRIMARY}} strokeWidth={3}/><span className="text-sm font-semibold">{item}</span></div>)}</div></div>
      <div className="border-[4px] border-black p-6 md:p-9" style={{backgroundColor:PRIMARY_CONTAINER,...hardShadowLg}}><div className="flex items-center gap-3 mb-3"><Sparkles className="w-8 h-8"/><span className="uppercase text-xs tracking-widest" style={monoStack}>Value-add expansion</span></div><h2 className="text-4xl md:text-6xl font-black mb-5" style={{...hankenStack,letterSpacing:"-0.04em",lineHeight:1}}>Pay when Service Writer creates more value.</h2><p className="text-lg leading-relaxed mb-7">Growth products monetize additional revenue, meaningful automation, advanced operations, or third-party infrastructure — not access to your own business data.</p><div className="space-y-3">{VALUE_ADD.map(item=><div key={item} className="flex gap-2 items-start border-b-2 border-black/15 pb-3"><ArrowRight className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={3}/><span className="text-sm font-semibold">{item}</span></div>)}</div></div>
    </section>

    <section className="mb-24 md:mb-32"><div className="max-w-3xl mb-9"><span className="uppercase text-xs tracking-widest" style={{...monoStack,color:PRIMARY}}>Built for the operator</span><h2 className="text-4xl md:text-6xl font-black mt-3" style={{...hankenStack,letterSpacing:"-0.04em",lineHeight:1.04}}>No data hostage traps.</h2></div><div className="grid md:grid-cols-3 gap-5"><NeoCard><Users className="w-8 h-8 mb-5"/><h3 className="text-2xl font-black mb-3" style={hankenStack}>Unlimited operation</h3><p className="text-neutral-600 leading-relaxed">Customers, vehicles, technicians, advisors, admins, and ordinary service records are not artificial upgrade triggers.</p></NeoCard><NeoCard><CreditCard className="w-8 h-8 mb-5"/><h3 className="text-2xl font-black mb-3" style={hankenStack}>Transparent hard costs</h3><p className="text-neutral-600 leading-relaxed">When carriers, data providers, or payment networks create real usage costs, those costs can be passed through clearly or bundled into the product using them.</p></NeoCard><NeoCard><CalendarDays className="w-8 h-8 mb-5"/><h3 className="text-2xl font-black mb-3" style={hankenStack}>Trigger moments, not walls</h3><p className="text-neutral-600 leading-relaxed">An overdue invoice can offer automated collections. A vehicle due for service can offer re-engagement. The core workflow keeps moving either way.</p></NeoCard></div></section>

    <section className="border-[4px] border-black p-8 md:p-14 text-center mb-8" style={{backgroundColor:PRIMARY_CONTAINER,...hardShadowLg}}><div className="flex justify-center gap-4 mb-5"><CarFront className="w-7 h-7"/><FileText className="w-7 h-7"/><ClipboardList className="w-7 h-7"/><CreditCard className="w-7 h-7"/></div><h2 className="text-4xl md:text-6xl font-black mb-5" style={{...hankenStack,lineHeight:1.02,letterSpacing:"-0.04em"}}>Run the business. Then grow it.</h2><p className="max-w-2xl mx-auto mb-8 text-lg leading-relaxed">Create your workspace, configure your services and labor, add or import customers, and run your first live job without deciding whether basic shop operations are worth another monthly software bill.</p><Link to="/signup" className={neoBtn} style={{backgroundColor:"#fff",...hardShadow}}>Create your free workspace <ArrowRight className="w-4 h-4"/></Link></section>
  </MarketingLayout>;
}
