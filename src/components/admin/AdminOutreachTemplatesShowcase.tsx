import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Check, Clipboard, Mail, MessageSquareText, Plus, Search, Send, Wrench } from "lucide-react";

type OutreachTemplate = {
  id: string;
  name: string;
  stage: "First touch" | "Follow-up" | "Nurture";
  channel: "Email" | "SMS";
  subject: string;
  body: string;
};

const templates: OutreachTemplate[] = [
  {
    id: "repair-shop-intro",
    name: "Independent repair shop intro",
    stage: "First touch",
    channel: "Email",
    subject: "A simpler service workflow for {{business_name}}",
    body: `Hi {{first_name}},

I’m reaching out because {{business_name}} looks like the kind of independent shop we built Service Writer for.

The platform keeps estimates, customer approvals, technician updates, and payments in one workflow—without adding more admin work at the counter.

Would a 15-minute walkthrough on {{proposed_day}} be useful? I can tailor it around how your team works today.

{{sender_name}}`,
  },
  {
    id: "missed-call-follow-up",
    name: "Missed-call follow-up",
    stage: "Follow-up",
    channel: "Email",
    subject: "Following up with {{business_name}}",
    body: `Hi {{first_name}},

I tried reaching you because we help automotive shops reduce the time spent chasing approvals and updating customers.

If improving the handoff from estimate to completed repair is a priority, I’d be glad to show you the workflow. Is {{proposed_day}} a reasonable time for a short call?

{{sender_name}}`,
  },
  {
    id: "software-check-in",
    name: "Current software check-in",
    stage: "Nurture",
    channel: "SMS",
    subject: "",
    body: "Hi {{first_name}}, this is {{sender_name}} with Service Writer. Are you open to seeing a faster way for {{business_name}} to send estimates, collect approvals, and keep customers updated? Reply STOP to opt out.",
  },
];

const stages = ["All", "First touch", "Follow-up", "Nurture"] as const;

export const AdminOutreachTemplatesShowcase = () => {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<(typeof stages)[number]>("All");
  const [selectedId, setSelectedId] = useState(templates[0].id);
  const [drafts, setDrafts] = useState(templates);
  const [copied, setCopied] = useState(false);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return drafts.filter(
      (template) =>
        (stage === "All" || template.stage === stage) &&
        (!normalizedQuery ||
          template.name.toLowerCase().includes(normalizedQuery) ||
          template.body.toLowerCase().includes(normalizedQuery)),
    );
  }, [drafts, query, stage]);

  const selected = drafts.find((template) => template.id === selectedId) ?? drafts[0];

  const updateSelected = (updates: Partial<OutreachTemplate>) => {
    setDrafts((current) => current.map((template) => (template.id === selected.id ? { ...template, ...updates } : template)));
  };

  const createTemplate = () => {
    const id = `draft-${Date.now()}`;
    const draft: OutreachTemplate = {
      id,
      name: "Untitled automotive outreach",
      stage: "First touch",
      channel: "Email",
      subject: "",
      body: "Hi {{first_name}},\n\n",
    };
    setDrafts((current) => [draft, ...current]);
    setSelectedId(id);
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(selected.channel === "Email" ? `${selected.subject}\n\n${selected.body}` : selected.body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="border-b bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
              <Wrench className="h-4 w-4" /> Automotive sales workspace
            </div>
            <CardTitle className="text-2xl">Outreach templates</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Build practical, reusable messages for automotive prospects. No invented performance claims.
            </p>
          </div>
          <Button className="gap-2" onClick={createTemplate}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid min-h-[620px] lg:grid-cols-[340px_1fr]">
          <aside className="border-b bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="bg-white pl-9"
                placeholder="Search templates..."
              />
            </div>
            <div className="my-4 flex flex-wrap gap-2">
              {stages.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={stage === item ? "default" : "outline"}
                  className="h-7 rounded-md px-3 text-xs"
                  onClick={() => setStage(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selected.id === template.id
                      ? "border-slate-900 bg-white shadow-sm"
                      : "border-transparent hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                    {template.channel === "Email" ? (
                      <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <MessageSquareText className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                  </div>
                  <Badge variant="secondary" className="mt-2 text-[11px]">
                    {template.stage}
                  </Badge>
                </button>
              ))}
              {filteredTemplates.length === 0 && (
                <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                  No templates match this search.
                </p>
              )}
            </div>
          </aside>

          <section className="bg-white p-5 md:p-7">
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Template editor</p>
                  <p className="mt-1 text-sm text-muted-foreground">Personalize before sending to any prospect.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2" onClick={copyMessage}>
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button className="gap-2" disabled>
                    <Send className="h-4 w-4" /> Connect sender
                  </Button>
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Template name</span>
                <Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Pipeline stage</span>
                  <select
                    value={selected.stage}
                    onChange={(event) => updateSelected({ stage: event.target.value as OutreachTemplate["stage"] })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {stages.slice(1).map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Channel</span>
                  <select
                    value={selected.channel}
                    onChange={(event) => updateSelected({ channel: event.target.value as OutreachTemplate["channel"] })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option>Email</option>
                    <option>SMS</option>
                  </select>
                </label>
              </div>

              {selected.channel === "Email" && (
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Subject line</span>
                  <Input value={selected.subject} onChange={(event) => updateSelected({ subject: event.target.value })} />
                </label>
              )}

              <label className="block space-y-2">
                <span className="text-sm font-medium">Message</span>
                <textarea
                  value={selected.body}
                  onChange={(event) => updateSelected({ body: event.target.value })}
                  className="min-h-64 w-full resize-y rounded-md border border-input bg-background p-4 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-sm font-semibold text-blue-950">Available prospect fields</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["{{first_name}}", "{{business_name}}", "{{proposed_day}}", "{{sender_name}}"].map((field) => (
                    <code key={field} className="rounded bg-white px-2 py-1 text-xs text-blue-800">{field}</code>
                  ))}
                </div>
                <p className="mt-3 text-xs text-blue-800">
                  Sending remains unavailable until an email or SMS provider is connected and consent controls are configured.
                </p>
              </div>
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
};
