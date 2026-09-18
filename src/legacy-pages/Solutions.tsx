import { Link } from "react-router-dom";
import { ArrowRight, Building2, CarFront, Gauge, MapPin, Truck, Wrench } from "lucide-react";
import { MarketingLayout, PageHeader, hardShadow, hankenStack, neoBtn, PRIMARY_CONTAINER } from "@/components/marketing/MarketingLayout";

const SOLUTIONS = [
  { icon: Wrench, title: "Independent Repair Shops", body: "Run customers, vehicles, appointments, estimates, approvals, inspections, service, invoices, payments, and history without stitching together separate systems.", to: "/features-guide" },
  { icon: MapPin, title: "Mobile Mechanics", body: "Take the service writer into the field with scheduling, technician workflows, VIN and mileage verification, inspections, customer authorization, payment, and service history.", to: "/how-it-works" },
  { icon: Gauge, title: "Oil Change & Quick Service", body: "Move quickly from appointment to start-job inspection, recommendations, approval, completion, and checkout while preserving the exact vehicle and service history.", to: "/how-it-works" },
  { icon: CarFront, title: "Tire Businesses", body: "Manage tire-oriented booking, vehicles, service packages, photos, technicians, invoices, payments, customer records, and fleet work.", to: "/tire" },
  { icon: Building2, title: "Detailers", body: "Coordinate packages, booking, customers, vehicles, technicians, recurring services, payment, and retention from one operating system.", to: "/detailers" },
  { icon: Truck, title: "Fleet Service Providers", body: "Add commercial fleet operations, recurring maintenance, dispatch, approvals, manager visibility, billing, and reporting when fleet becomes part of the business.", to: "/features/dispatch-fleet" },
];

export default function Solutions() {
  return <MarketingLayout>
    <PageHeader eyebrow="Solutions" title="One service workflow. Different ways to run it." subtitle="Service Writer starts with the same operational foundation and adapts it to the business you actually operate — shop, mobile, quick service, tire, detailing, or fleet." />
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">{SOLUTIONS.map(({icon:Icon,title,body,to})=><article key={title} className="bg-white border-[4px] border-black p-7 flex flex-col" style={hardShadow}><Icon className="w-8 h-8 mb-5" strokeWidth={2.5}/><h2 className="text-2xl font-black mb-3" style={hankenStack}>{title}</h2><p className="text-neutral-600 leading-relaxed flex-1">{body}</p><Link to={to} className="font-black mt-6 inline-flex items-center gap-2">Explore <ArrowRight className="w-4 h-4"/></Link></article>)}</div>
    <div className="border-[4px] border-black p-8 md:p-12 text-center" style={{backgroundColor:PRIMARY_CONTAINER,...hardShadow}}><h2 className="text-3xl md:text-5xl font-black mb-4" style={hankenStack}>Start with the operational core.</h2><p className="max-w-2xl mx-auto mb-7 text-lg">Customers, vehicles, appointments and the everyday service workflow come first. Add advanced growth and fleet capabilities when they create additional value.</p><Link to="/signup" className={neoBtn} style={{backgroundColor:"#fff",...hardShadow}}>Start Free <ArrowRight className="w-4 h-4"/></Link></div>
  </MarketingLayout>;
}
