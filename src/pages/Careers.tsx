import { Link } from "react-router-dom";
import { MapPin, Briefcase } from "lucide-react";
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

const FUTURE_ROLES = [
  {
    title: "Founding Full-Stack Engineer",
    team: "Engineering",
    location: "Remote — US",
    type: "Full-time",
    blurb: "Ship the mobile dispatch, DVI, and offline sync surface. TypeScript, React, Postgres.",
  },
  {
    title: "Field Success Manager",
    team: "Customer Success",
    location: "Remote — US",
    type: "Full-time",
    blurb: "Onboard shop owners and mobile mechanics. Ride along, learn the job, make the product better.",
  },
  {
    title: "Design Engineer",
    team: "Design",
    location: "Remote — US",
    type: "Full-time",
    blurb: "Own the marketing site and in-product visual system end to end. Code-fluent, opinionated, fast.",
  },
];

const VALUES = [
  { title: "Field-first", body: "We design from the van back to the spreadsheet — not the other way around." },
  { title: "Operator empathy", body: "Every PM and engineer spends real time with shops. No exceptions." },
  { title: "Ship weekly", body: "Small, durable releases. We'd rather fix it tomorrow than guess for a month." },
  { title: "Own your work", body: "Tight teams, real ownership, no committee-driven product." },
];

export default function Careers() {
  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="Careers"
        title="Build the operating system independent shops actually want."
        subtitle="We're a small, senior team building the back office for the people who keep America's vehicles on the road."
      />

      <section className="mb-20">
        <div className="flex items-center gap-6 mb-10">
          <h2 className="uppercase tracking-widest text-white px-6 py-2 text-2xl font-black" style={{ ...hankenStack, backgroundColor: "#000" }}>
            How we work
          </h2>
          <div className="h-[4px] flex-grow bg-black" />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {VALUES.map((v) => (
            <NeoCard key={v.title}>
              <h3 className="text-xl font-black mb-2" style={hankenStack}>{v.title}</h3>
              <p style={{ color: "#3a3a3a" }}>{v.body}</p>
            </NeoCard>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-6 mb-10">
          <h2 className="uppercase tracking-widest text-white px-6 py-2 text-2xl font-black" style={{ ...hankenStack, backgroundColor: "#000" }}>
            Future roles
          </h2>
          <div className="h-[4px] flex-grow bg-black" />
        </div>

        <p className="mb-8 text-lg" style={{ color: "#3a3a3a" }}>
          We are not running a formal hiring process for these seats today, but these are the roles we expect to add as the team grows.
        </p>

        <div className="space-y-5">
          {FUTURE_ROLES.map((r) => (
            <NeoCard key={r.title}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-widest mb-2" style={{ ...monoStack, color: PRIMARY }}>
                    {r.team}
                  </div>
                  <h3 className="text-2xl font-black mb-2" style={hankenStack}>{r.title}</h3>
                  <p className="mb-3" style={{ color: "#3a3a3a" }}>{r.blurb}</p>
                  <div className="flex flex-wrap gap-4 text-sm" style={{ color: "#5e5e5e" }}>
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {r.location}</span>
                    <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" /> {r.type}</span>
                  </div>
                </div>
                <Link
                  to="/contact"
                  className={neoBtn}
                  style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow, fontSize: "0.875rem" }}
                >
                  Contact us
                </Link>
              </div>
            </NeoCard>
          ))}
        </div>

        <p className="text-center mt-10" style={{ color: "#5e5e5e" }}>
          Interested in future roles? Email <a className="underline font-bold" href="mailto:careers@servicewriter.xyz">careers@servicewriter.xyz</a> or use the contact page.
        </p>
      </section>
    </MarketingLayout>
  );
}
