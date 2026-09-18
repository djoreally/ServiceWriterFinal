import { Link } from "react-router-dom";
import { ArrowRight, Bot, BriefcaseBusiness, CreditCard, MessageSquare, Smartphone, Truck } from "lucide-react";
import { featurePages } from "@/content/featurePages";
import { MarketingLayout, PageHeader, hardShadow, hankenStack, monoStack, neoBtn, PRIMARY, PRIMARY_CONTAINER } from "@/components/marketing/MarketingLayout";

const GROUPS = [
  { title:"Shop OS", icon:BriefcaseBusiness, copy:"The everyday operating layer: booking, scheduling, customers, vehicles, service history, estimates, approvals, service records, invoices, reporting, and financial visibility.", slugs:["booking-scheduling","customer-vehicle-history","reporting-retention"] },
  { title:"Technician OS", icon:Smartphone, copy:"The job-execution layer: exact vehicle context, VIN and mileage, start-job workflow, service-specific inspections, findings, photos, recommendations, status, and completion.", slugs:["technician-os"] },
  { title:"Customer Experience", icon:MessageSquare, copy:"Keep customers connected to the work through booking, approvals, transactional communication, payment, history, and the customer-facing service experience.", slugs:[] },
  { title:"Growth", icon:ArrowRight, copy:"Turn completed work and vehicle history into reminders, loyalty, reviews, re-engagement, campaigns, marketplace acquisition, and repeat business.", slugs:["growth-tools"] },
  { title:"Fleet", icon:Truck, copy:"Commercial operations for providers managing fleet accounts, recurring maintenance, dispatch, work orders, contracts, approvals, billing, and manager visibility.", slugs:["dispatch-fleet"] },
  { title:"Payments & Financials", icon:CreditCard, copy:"Move authorized work through invoicing, payment collection, reconciliation, revenue visibility, expenses, profitability, and reporting.", slugs:["payments-invoicing"] },
  { title:"AI & Automation", icon:Bot, copy:"Add operational intelligence, summaries, drafting, workflow assistance, and automation where it saves time or creates measurable value.", slugs:["ai-assistant"] },
];

export default function FeaturesGuide(){
 return <MarketingLayout>
  <PageHeader eyebrow="Product" title="One operating system, organized around the work." subtitle="Service Writer is not a pile of disconnected features. Each product area supports a stage of the service operation — from customer intake through technician execution, payment, history, and growth."/>
  <div className="grid md:grid-cols-2 gap-6 mb-16">{GROUPS.map(({title,icon:Icon,copy,slugs})=><section key={title} className="bg-white border-[4px] border-black p-7" style={hardShadow}><div className="flex items-center gap-3 mb-4"><Icon className="w-7 h-7"/><h2 className="text-3xl font-black" style={hankenStack}>{title}</h2></div><p className="text-neutral-600 leading-relaxed mb-6">{copy}</p><div className="space-y-3">{slugs.map(slug=>{const f=featurePages.find(x=>x.slug===slug);return f?<Link key={slug} to={`/features/${slug}`} className="flex items-center justify-between border-t-2 border-black/10 pt-3 font-bold"><span>{f.name}</span><ArrowRight className="w-4 h-4"/></Link>:null})}</div></section>)}</div>
  <section className="border-[4px] border-black p-8 md:p-12 mb-12" style={{backgroundColor:PRIMARY_CONTAINER,...hardShadow}}><div className="text-xs uppercase tracking-widest mb-3" style={{...monoStack,color:PRIMARY}}>How the pieces connect</div><h2 className="text-3xl md:text-5xl font-black mb-5" style={hankenStack}>The appointment carries the non-fleet service job from schedule to payment.</h2><p className="text-lg max-w-4xl leading-relaxed mb-7">Customer and vehicle context flows into the appointment. Start Job verifies the vehicle and begins the inspection. Findings can become recommendations. Approved work stays attached to that appointment and exact vehicle. Completion flows into invoice, payment, history, and retention.</p><Link to="/how-it-works" className={neoBtn} style={{backgroundColor:"#fff",...hardShadow}}>See the complete workflow <ArrowRight className="w-4 h-4"/></Link></section>
 </MarketingLayout>;
}