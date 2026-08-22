import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  FileText,
  HelpCircle,
  MapPin,
  Receipt,
  ScanLine,
  ShoppingCart,
  Trophy,
  Users,
} from "lucide-react";

type HelpSection = {
  id: string;
  title: string;
  path: string;
  icon: LucideIcon;
  summary: string;
  useFor: string[];
  workflow: string[];
  tips: string[];
};

const helpSections: HelpSection[] = [
  {
    id: "overview",
    title: "Overview",
    path: "/fleet-os",
    icon: BarChart3,
    summary: "The command center for fleet health, open work, upcoming schedule pressure, invoice status, and high-level operational metrics.",
    useFor: ["Daily manager check-in", "Finding open or overdue work", "Quickly jumping to vehicles, orders, and invoices"],
    workflow: ["Review open orders and upcoming scheduled work.", "Investigate any overdue or blocked items.", "Use the metric cards to jump into the detailed tab that owns the issue."],
    tips: ["Start here at the beginning of each shift.", "If a number looks wrong, drill into the related tab rather than editing from the dashboard."],
  },
  {
    id: "clients",
    title: "Clients",
    path: "/fleet-os/clients",
    icon: Building2,
    summary: "The top-level account record for each fleet customer. Client selection controls which contacts, vehicles, contracts, POs, and work orders belong together.",
    useFor: ["Creating and managing fleet accounts", "Opening a client-specific workspace", "Reviewing a client's vehicles and work orders"],
    workflow: ["Create the client first.", "Add contacts, locations, contracts, and vehicles under that client.", "Use the client detail page when you need a single-client operating view."],
    tips: ["Keep company names consistent for easier filtering.", "Do not create duplicate clients for different locations; use Locations for sites."],
  },
  {
    id: "vehicles",
    title: "Vehicles",
    path: "/fleet-os/vehicles",
    icon: Car,
    summary: "The core asset list. Vehicles are client-specific and drive service history, scheduling context, work order creation, and reporting.",
    useFor: ["Adding or importing units", "Filtering by client, status, location, contract, or missing data", "Opening a complete vehicle profile"],
    workflow: ["Select or filter to the client you are working on.", "Use data-quality filters to clean up missing VINs, locations, and contracts.", "Open a vehicle profile to review history or start a new work order."],
    tips: ["Unit number and VIN are the fastest ways to identify assets.", "Keep location and contract assignments current so scheduling and billing rules apply correctly."],
  },
  {
    id: "work-orders",
    title: "Work Orders",
    path: "/fleet-os/work-orders",
    icon: ClipboardList,
    summary: "The service lifecycle board for fleet jobs, from draft or scheduled work through assignment, execution, completion, invoicing, and payment.",
    useFor: ["Creating controlled work orders", "Dispatching technicians", "Tracking status and completion", "Reviewing service details and line items"],
    workflow: ["Choose the fleet client first, then choose or add the client vehicle.", "Select the service package and schedule window.", "Assign, execute, complete, and invoice from the work order detail page."],
    tips: ["Keep work orders tied to the correct client vehicle to protect billing and reporting accuracy.", "Use statuses as operational truth; avoid leaving completed work in in-progress states."],
  },
  {
    id: "locations",
    title: "Locations",
    path: "/fleet-os/locations",
    icon: MapPin,
    summary: "Service sites, yards, depots, and customer locations where vehicles are parked, checked in, or serviced.",
    useFor: ["Setting service windows", "Capturing site instructions", "Organizing vehicles by depot or operating area"],
    workflow: ["Create locations under the correct client.", "Set service windows and access instructions.", "Assign vehicles to locations so schedules and check-ins have context."],
    tips: ["Use one location per real service site.", "Keep access notes current for technicians and dispatchers."],
  },
  {
    id: "contracts",
    title: "Contracts",
    path: "/fleet-os/contracts",
    icon: FileText,
    summary: "Client-specific pricing, SLA, approval, PO, and service-scope rules that govern how work is created and billed.",
    useFor: ["Defining service rules", "Managing SLA expectations", "Controlling PO and approval requirements"],
    workflow: ["Create or activate a contract for the client.", "Attach service profiles and pricing rules.", "Assign vehicles to the contract when rules should apply to their work orders."],
    tips: ["Contract rules should be explicit before high-volume scheduling.", "If a work order behaves unexpectedly, verify the vehicle's linked contract."],
  },
  {
    id: "invoices",
    title: "Invoices",
    path: "/fleet-os/invoices",
    icon: Receipt,
    summary: "Billing and accounts receivable view for completed fleet work orders.",
    useFor: ["Reviewing completed billable work", "Tracking invoice status", "Following up on unpaid fleet work"],
    workflow: ["Complete the work order with accurate totals.", "Generate or review the invoice from completed work.", "Track invoice status through paid or follow-up states."],
    tips: ["Confirm PO status before invoicing when the contract requires authorization.", "Use client and vehicle context to resolve billing questions quickly."],
  },
  {
    id: "pos",
    title: "POs",
    path: "/fleet-os/pos",
    icon: ShoppingCart,
    summary: "Purchase order control for client-authorized spend, reservations, and billing protection.",
    useFor: ["Recording client PO numbers", "Tracking authorized and remaining balances", "Preventing unauthorized work or invoicing"],
    workflow: ["Create or import the PO under the fleet client.", "Attach the PO to work orders when required.", "Monitor remaining balance as work is authorized and consumed."],
    tips: ["POs must belong to the same client as the work order vehicle.", "Close or update exhausted POs to avoid dispatch confusion."],
  },
  {
    id: "reports",
    title: "Reports",
    path: "/fleet-os/reports",
    icon: BarChart3,
    summary: "Analytics for fleet spend, vehicle performance, operational throughput, and client-level reporting.",
    useFor: ["Reviewing spend trends", "Identifying high-cost vehicles", "Preparing client performance summaries"],
    workflow: ["Keep work orders and invoices accurate.", "Use report views to identify patterns.", "Act on high-cost vehicles, repeat services, or workflow bottlenecks."],
    tips: ["Reports are only as good as vehicle, client, and work order data quality.", "Clean missing VIN/location/contract data before relying on trend analysis."],
  },
  {
    id: "contacts",
    title: "Contacts",
    path: "/fleet-os/contacts",
    icon: Users,
    summary: "People connected to fleet clients, including approval contacts, billing contacts, and site contacts.",
    useFor: ["Managing approvers", "Finding billing contacts", "Documenting who receives reports or invoices"],
    workflow: ["Add contacts under the correct client.", "Set permissions like approval, invoice receipt, or report receipt.", "Keep contact roles updated as client staff changes."],
    tips: ["Use role labels consistently.", "Make sure approval contacts are current before enabling approval-heavy contracts."],
  },
  {
    id: "scheduler",
    title: "Scheduler",
    path: "/fleet-os/scheduler",
    icon: CalendarDays,
    summary: "Calendar view for fleet work by service window, technician, van, and operational capacity.",
    useFor: ["Planning daily or weekly workload", "Balancing technician routes", "Spotting scheduling conflicts"],
    workflow: ["Create or approve work orders first.", "Use the scheduler to review placement and capacity.", "Adjust assignments or times from work order detail when needed."],
    tips: ["Keep locations accurate so route planning makes sense.", "Use service windows to protect client expectations."],
  },
  {
    id: "checkin",
    title: "Check-In",
    path: "/fleet-os/checkin",
    icon: ScanLine,
    summary: "Mobile-friendly arrival and departure logging for field work, including work order status updates and location verification.",
    useFor: ["Technician arrival/departure", "Geo check-in evidence", "Updating scheduled work to in-progress or completed"],
    workflow: ["Open today's scheduled work.", "Record arrival when the technician reaches the site.", "Record departure when work is complete or the visit ends."],
    tips: ["Use check-in consistently for field accountability.", "If a work order is missing, verify it is scheduled for today and assigned to the correct client/location."],
  },
];

const workflowSteps = [
  "Create the fleet client.",
  "Add contacts, locations, and contracts for that client.",
  "Add or import client vehicles and keep VIN/location/contract data clean.",
  "Create work orders from the client vehicle context.",
  "Schedule, assign, check in, complete, invoice, and report.",
];

type CreditStatus = "pending" | "applied" | "failed" | "disabled" | "capped";
type RemoteModule = { id: string; slug: string; reward_cents: number };
type Completion = { module_id: string; credit_status: CreditStatus; credit_error: string | null };

const FleetHelpPage = () => {
  const [remoteModules, setRemoteModules] = useState<RemoteModule[]>([]);
  const [completionBySlug, setCompletionBySlug] = useState<Record<string, Completion>>({});
  const [pendingBySlug, setPendingBySlug] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("training-progress", { body: { surface: "fleet_os" } });
      if (error) return;
      const mods = (data?.modules ?? []) as (RemoteModule & { slug: string })[];
      const comps = (data?.completions ?? []) as Completion[];
      setRemoteModules(mods);
      const byId = Object.fromEntries(mods.map((m) => [m.id, m.slug]));
      setCompletionBySlug(Object.fromEntries(comps.map((c) => [byId[c.module_id], c]).filter(([k]) => !!k) as [string, Completion][]));
    })();
  }, []);

  const completedModules = useMemo(() => {
    return new Set(
      Object.entries(completionBySlug)
        .filter(([, c]) => c.credit_status === "applied" || c.credit_status === "pending")
        .map(([slug]) => slug),
    );
  }, [completionBySlug]);

  const completedCount = completedModules.size;
  const trainingProgress = useMemo(() => Math.round((completedCount / helpSections.length) * 100), [completedCount]);
  const unlockedCredit = useMemo(() => {
    return remoteModules.reduce((sum, m) => {
      const c = completionBySlug[m.slug];
      return c?.credit_status === "applied" ? sum + m.reward_cents / 100 : sum;
    }, 0);
  }, [remoteModules, completionBySlug]);

  const toggleModule = async (slug: string) => {
    const existing = completionBySlug[slug];
    if (existing && (existing.credit_status === "applied" || existing.credit_status === "disabled" || existing.credit_status === "capped")) return;
    setPendingBySlug((p) => ({ ...p, [slug]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("complete-training-module", {
        body: { slug, surface: "fleet_os" },
      });
      if (error) throw error;
      const status = (data?.credit_status ?? "pending") as CreditStatus;
      setCompletionBySlug((prev) => ({ ...prev, [slug]: { module_id: "", credit_status: status, credit_error: data?.error ?? null } }));
      if (status === "applied") toast.success("Training complete — $1 subscription credit applied");
      else if (status === "failed") toast.error("Training complete but credit failed — support has been notified");
      else if (status === "capped") toast.info("Training complete — reward cap reached");
      else if (status === "disabled") toast.info("Training complete — rewards are currently paused");
      else toast.success("Training complete — credit pending");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete module");
    } finally {
      setPendingBySlug((p) => ({ ...p, [slug]: false }));
    }
  };

  return (
  <FleetOSLayout title="Fleet OS Help">
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Badge variant="outline" className="mb-3">Fleet OS Documentation</Badge>
            <h2 className="text-2xl font-bold tracking-tight">How each Fleet OS tab works</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Fleet OS is organized around one clean operating model: every fleet client owns contacts,
              locations, contracts, vehicles, work orders, purchase orders, invoices, and reports. Use this guide
              when onboarding staff or deciding which tab owns a workflow.
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-medium">Recommended flow</p>
            <p className="mt-1 text-muted-foreground">Client → Location/Contract → Vehicle → Work Order → Invoice → Report</p>
          </div>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-3 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Fleet OS training rewards</p>
                <p className="text-sm text-muted-foreground">Business owners: complete each module to earn a real $1 credit off your Service Writer subscription. Credits post to your Stripe account balance and apply automatically to your next subscription invoice.</p>
              </div>
            </div>
            <div className="min-w-[220px] space-y-2">
              <div className="flex justify-between text-sm">
                <span>{completedCount}/{helpSections.length} modules</span>
                <span>${unlockedCredit.toFixed(unlockedCredit % 1 === 0 ? 0 : 2)} applied</span>
              </div>
              <Progress value={trainingProgress} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operating checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {workflowSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tab reference</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" defaultValue={["clients", "vehicles", "work-orders"]} className="w-full">
              {helpSections.map((section) => {
                const Icon = section.icon;
                return (
                  <AccordionItem key={section.id} value={section.id}>
                    <AccordionTrigger className="gap-3 text-left hover:no-underline">
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-semibold">{section.title}{completedModules.has(section.id) && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}</span>
                          <span className="block truncate text-xs font-normal text-muted-foreground">{section.summary}</span>
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 pl-11 md:grid-cols-3">
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Use this tab for</p>
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {section.useFor.map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Typical workflow</p>
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {section.workflow.map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best-practice notes</p>
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {section.tips.map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant={completedModules.has(section.id) ? "secondary" : "default"}
                              disabled={!!pendingBySlug[section.id] || completionBySlug[section.id]?.credit_status === "applied" || completionBySlug[section.id]?.credit_status === "disabled" || completionBySlug[section.id]?.credit_status === "capped"}
                              onClick={() => toggleModule(section.id)}
                            >
                              {pendingBySlug[section.id] ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Working…</> :
                                completionBySlug[section.id]?.credit_status === "applied" ? "Completed" :
                                completionBySlug[section.id]?.credit_status === "failed" ? "Retry" :
                                completionBySlug[section.id] ? "Refresh status" :
                                "Complete module"}
                            </Button>
                            <Link to={section.path} className="inline-flex text-sm font-medium text-primary hover:underline">
                              Open {section.title}
                            </Link>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  </FleetOSLayout>
  );
};

export default FleetHelpPage;
