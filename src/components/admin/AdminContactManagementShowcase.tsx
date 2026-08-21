import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  Database,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Users,
  Wrench,
} from "lucide-react";

const phases = [
  {
    step: "01",
    title: "Build the prospect record",
    description: "Create one reliable profile for every automotive business and decision-maker.",
    status: "Ready to build",
    icon: Database,
    items: ["Business + location", "Owner or manager", "Phone, email + website", "Source + verified date"],
  },
  {
    step: "02",
    title: "Connect prospect search",
    description: "Find shops by market, geography, specialty, size, and fit for the platform.",
    status: "Integration next",
    icon: Search,
    items: ["Search provider API", "Duplicate prevention", "Contact enrichment", "Save to pipeline"],
  },
  {
    step: "03",
    title: "Run the sales pipeline",
    description: "Turn saved prospects into focused, trackable outreach instead of a static contact list.",
    status: "Planned",
    icon: Target,
    items: ["Qualification notes", "Stage + next action", "Outreach history", "Follow-up reminders"],
  },
];

const databaseFields = [
  { label: "Business", value: "Name, website, phone, address", icon: Building2 },
  { label: "Market", value: "Repair shop, dealer, tire, fleet, mobile", icon: Wrench },
  { label: "Territory", value: "City, state, radius, assigned owner", icon: MapPin },
  { label: "Contacts", value: "Decision-maker, role, email, direct line", icon: Users },
  { label: "Qualification", value: "Shop size, services, software, fit score", icon: Sparkles },
  { label: "Engagement", value: "Stage, last touch, next step, notes", icon: Target },
];

export const AdminContactManagementShowcase = () => {
  return (
    <Card className="overflow-hidden border-slate-200 bg-slate-50/40 shadow-sm">
      <CardHeader className="border-b bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                Planning workspace
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">Automotive prospecting</span>
            </div>
            <CardTitle className="text-2xl">Build a real prospect database</CardTitle>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Replace the sample contact list with a source-backed sales workspace for finding,
              qualifying, and pitching automotive businesses on the platform.
            </p>
          </div>
          <Button className="gap-2">
            Start with the data model
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          {phases.map((phase, index) => {
            const Icon = phase.icon;
            return (
              <Card key={phase.step} className="border-slate-200 bg-white shadow-none">
                <CardContent className="p-5">
                  <div className="mb-5 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-400">PHASE {phase.step}</span>
                  </div>
                  <h3 className="font-semibold text-slate-950">{phase.title}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-5 text-muted-foreground">{phase.description}</p>
                  <div className="my-4 h-px bg-slate-100" />
                  <ul className="space-y-2">
                    {phase.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-slate-700">
                        {index === 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-300" />
                        )}
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Badge
                    variant="secondary"
                    className={`mt-5 ${index === 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {phase.status}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Minimum viable prospect record</CardTitle>
              <p className="text-sm text-muted-foreground">
                The fields needed before search results become usable sales opportunities.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {databaseFields.map((field) => {
                const Icon = field.icon;
                return (
                  <div key={field.label} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{field.label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">{field.value}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-slate-900 bg-slate-950 text-white shadow-none">
            <CardHeader className="pb-3">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <CardTitle className="text-base text-white">Definition of done</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <p>Every displayed prospect must be stored in the database—not hard-coded UI data.</p>
              <p>Every record includes its source, verification timestamp, owner, and a clear next action.</p>
              <p>Search imports are reviewed before saving, with duplicate checks and an audit trail.</p>
              <div className="pt-2">
                <Button variant="secondary" className="w-full gap-2">
                  <Upload className="h-4 w-4" />
                  Use CSV as a temporary source
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
};
