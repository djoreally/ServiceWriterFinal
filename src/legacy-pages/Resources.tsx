import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CircleHelp, Headphones, Lightbulb, Newspaper, ShieldCheck } from "lucide-react";
import { MarketingLayout, PageHeader, hardShadow, hankenStack } from "@/components/marketing/MarketingLayout";

const RESOURCES = [
  { icon: BookOpen, title: "How It Works", body: "Follow the Service Writer workflow from customer intake through service, payment, history, and retention.", to: "/how-it-works" },
  { icon: Newspaper, title: "Blog", body: "Product updates and operator playbooks for automotive service businesses.", to: "/blog" },
  { icon: Lightbulb, title: "Insights", body: "Operational, technical, and fleet-focused guidance for modern service teams.", to: "/insights" },
  { icon: CircleHelp, title: "FAQs", body: "Answers about features, payments, messaging, booking, offline use, security, and getting started.", to: "/faqs" },
  { icon: Headphones, title: "Support", body: "Get help with setup, troubleshooting, billing, booking pages, messaging, payments, and daily workflows.", to: "/support" },
  { icon: ShieldCheck, title: "Security", body: "Review Service Writer security controls, safeguards, and vulnerability disclosure information.", to: "/security" },
];

export default function Resources() {
  return <MarketingLayout>
    <PageHeader eyebrow="Resources" title="Understand the product. Run the operation." subtitle="Product education, operator guidance, support, and technical information in one place." />
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{RESOURCES.map(({icon:Icon,title,body,to})=><Link key={title} to={to} className="bg-white border-[4px] border-black p-7 block" style={hardShadow}><Icon className="w-8 h-8 mb-5" strokeWidth={2.5}/><h2 className="text-2xl font-black mb-3" style={hankenStack}>{title}</h2><p className="text-neutral-600 leading-relaxed mb-6">{body}</p><span className="font-black inline-flex items-center gap-2">Open resource <ArrowRight className="w-4 h-4"/></span></Link>)}</div>
  </MarketingLayout>;
}
