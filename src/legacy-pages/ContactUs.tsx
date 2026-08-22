import { useState } from "react";
import { Clock, Mail, MessageSquare } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  MarketingLayout,
  PageHeader,
  NeoCard,
  neoBtn,
  hardShadow,
  hankenStack,
  monoStack,
  PRIMARY,
  PRIMARY_CONTAINER,
} from "@/components/marketing/MarketingLayout";

export default function ContactUs() {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Frontend-only: opens user's mail client. Wire to backend later if needed.
    const subject = encodeURIComponent(`Service Writer inquiry — ${form.company || form.name}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nCompany: ${form.company}\n\n${form.message}`,
    );
    window.location.href = `mailto:hello@servicewriter.xyz?subject=${subject}&body=${body}`;
    setTimeout(() => {
      setSubmitting(false);
      toast.success("Your email draft should be open and ready to send.");
    }, 400);
  };

  const inputCls =
    "w-full border-[3px] border-black bg-white px-4 py-3 font-medium focus:outline-none focus:translate-x-[2px] focus:translate-y-[2px] transition-transform";

  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="Contact"
        title="Talk to a real person."
        subtitle="Sales questions, technical questions, partnership ideas — we read every message."
      />

      <div className="grid md:grid-cols-3 gap-5 mb-12">
        {[
          { icon: Mail, label: "Email", value: "hello@servicewriter.xyz", href: "mailto:hello@servicewriter.xyz" },
          { icon: Clock, label: "Support hours", value: "US business hours", href: null },
          { icon: MessageSquare, label: "Demo", value: "Book demo", href: "#form" },
        ].map(({ icon: Icon, label, value, href }) => (
          <NeoCard key={label} className="text-center">
            <div
              className="w-12 h-12 border-[3px] border-black flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}
            >
              <Icon className="w-6 h-6" strokeWidth={2.5} />
            </div>
            <div className="text-xs uppercase tracking-widest mb-1" style={{ ...monoStack, color: PRIMARY }}>
              {label}
            </div>
            {href ? (
              <a href={href} className="font-bold underline">{value}</a>
            ) : (
              <div className="font-bold">{value}</div>
            )}
          </NeoCard>
        ))}
      </div>

      <NeoCard>
        <h2 id="form" className="text-3xl font-black mb-3" style={hankenStack}>
          Send us a note
        </h2>
        <p className="mb-6 max-w-2xl" style={{ color: "#3a3a3a" }}>
          This front-end form opens a prefilled email draft so you can review it before sending.
          For fastest help, include your company name and what you want to set up.
        </p>
        <form className="space-y-4 max-w-2xl" onSubmit={onSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold uppercase tracking-wide mb-1">Name</label>
              <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold uppercase tracking-wide mb-1">Email</label>
              <input required type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold uppercase tracking-wide mb-1">Company</label>
            <input className={inputCls} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-bold uppercase tracking-wide mb-1">Message</label>
            <textarea required rows={5} className={inputCls} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className={neoBtn}
            style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}
          >
            {submitting ? "Opening…" : "Open email draft"}
          </button>
        </form>
      </NeoCard>
    </MarketingLayout>
  );
}
