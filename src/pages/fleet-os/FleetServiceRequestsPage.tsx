import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Building2, Car, CheckCircle2, Clock3, Inbox, Loader2, MapPin, Plus, Search, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@packages/auth";
import { fetchFleetDispatchHealth, type FleetDispatchHealth } from "@/application/queries/fleet-dispatch-health.query";
import { features } from "@/config/features";
import {
  claimFleetServiceRequest, convertFleetServiceRequestToDraft, createFleetServiceRequest, listFleetServiceRequests,
  searchFleetDispatch, subscribeFleetServiceRequests, updateFleetServiceRequest,
  type FleetDispatchSearchResult, type FleetRequestPriority, type FleetRequestStatus, type FleetServiceRequest,
} from "@/application/queries/fleet-service-requests.query";

const OPEN_STATUSES: FleetRequestStatus[] = ["new", "triage", "waiting_customer", "waiting_approval", "waiting_po", "ready_to_schedule"];
const STATUS_LABEL: Record<FleetRequestStatus, string> = { new: "New", triage: "In triage", waiting_customer: "Waiting on customer", waiting_approval: "Waiting approval", waiting_po: "Waiting PO", ready_to_schedule: "Ready to schedule", scheduled: "Scheduled", converted: "Converted", declined: "Declined", duplicate: "Duplicate", closed: "Closed" };
const SOURCE_LABEL: Record<string, string> = { manual: "Manual", email: "Email", website_form: "Website", customer_portal: "Portal", ai_agent: "AI intake", api: "API", import: "Import", internal: "Internal", pm_automation: "PM automation", recurring: "Recurring" };
const priorityClass: Record<string, string> = { routine: "bg-muted text-muted-foreground", high: "bg-amber-500/10 text-amber-700", urgent: "bg-orange-500/10 text-orange-700", safety: "bg-destructive/10 text-destructive" };

function ageLabel(receivedAt: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(receivedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function FleetServiceRequestsWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [requests, setRequests] = useState<FleetServiceRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [filter, setFilter] = useState<"open" | "mine" | "all">("open");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<FleetDispatchSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({ subject: "", request_summary: "", requester_name: "", requester_email: "", priority: "routine" as FleetRequestPriority });
  const [health, setHealth] = useState<FleetDispatchHealth | null>(null);


  const load = useCallback(async () => {
    try {
      const [rows, nextHealth] = await Promise.all([listFleetServiceRequests(), fetchFleetDispatchHealth()]);
      setRequests(rows);
      setHealth(nextHealth);
      const requestedId = searchParams.get("request");
      setSelectedId((current) => requestedId && rows.some((row) => row.id === requestedId) ? requestedId : current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load service requests"); }
    finally { setLoading(false); }
  }, [searchParams]);

  useEffect(() => { void load(); return subscribeFleetServiceRequests(() => void load()); }, [load]);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearching(true);
      void searchFleetDispatch(query).then(setMatches).catch(() => setMatches([])).finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const visible = useMemo(() => requests.filter((request) => filter === "all" || (filter === "mine" ? request.assigned_to === user?.id && OPEN_STATUSES.includes(request.status) : OPEN_STATUSES.includes(request.status))), [requests, filter, user?.id]);
  const slaRisk = requests.filter((request) => OPEN_STATUSES.includes(request.status) && request.sla_due_at && new Date(request.sla_due_at) < new Date()).length;

  const execute = async (action: () => Promise<unknown>, success?: string) => {
    setWorking(true);
    try { await action(); if (success) toast.success(success); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Request could not be updated"); }
    finally { setWorking(false); }
  };

  const linkMatch = async (match: FleetDispatchSearchResult) => {
    if (!selected) return;
    const patch: Parameters<typeof updateFleetServiceRequest>[1] = { match_status: "confirmed" };
    if (match.fleet_client_id) patch.fleet_client_id = match.fleet_client_id;
    if (match.fleet_location_id) patch.fleet_location_id = match.fleet_location_id;
    if (match.entity_type === "client") patch.fleet_client_id = match.entity_id;
    if (match.entity_type === "location") patch.fleet_location_id = match.entity_id;
    if (match.entity_type === "vehicle") patch.fleet_vehicle_id = match.entity_id;
    await execute(() => updateFleetServiceRequest(selected, patch), `${match.title} linked`);
    setQuery(""); setMatches([]);
  };

  const create = async () => {
    if (!draft.subject.trim()) return;
    await execute(async () => {
      const created = await createFleetServiceRequest({ ...draft, subject: draft.subject.trim(), request_summary: draft.request_summary.trim() });
      setSelectedId(created.id); setNewOpen(false); setDraft({ subject: "", request_summary: "", requester_name: "", requester_email: "", priority: "routine" });
    }, "Request added to dispatch queue");
  };

  return <FleetOSLayout title="Service Requests">
    <div className="-m-4 min-h-[calc(100vh-73px)] bg-muted/20 md:-m-6">
      <header className="border-b bg-card px-4 py-4 md:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Dispatch intake</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Service requests</h1><p className="mt-1 text-sm text-muted-foreground">Own, identify, qualify, and convert every included request from one queue.</p></div>
          <Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" />New request</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <Card className="p-3 shadow-none"><p className="text-xs text-muted-foreground">Open queue</p><p className="mt-1 text-xl font-bold">{requests.filter((r) => OPEN_STATUSES.includes(r.status)).length}</p></Card>
          <Card className="p-3 shadow-none"><p className="text-xs text-muted-foreground">Unclaimed</p><p className="mt-1 text-xl font-bold">{requests.filter((r) => OPEN_STATUSES.includes(r.status) && !r.assigned_to).length}</p></Card>
          <Card className={cn("p-3 shadow-none", slaRisk > 0 && "border-destructive/50")}><p className="text-xs text-muted-foreground">SLA risk</p><p className={cn("mt-1 text-xl font-bold", slaRisk > 0 && "text-destructive")}>{slaRisk}</p></Card>
          <Card className="p-3 shadow-none"><p className="text-xs text-muted-foreground">P95 response</p><p className="mt-1 text-xl font-bold">{health?.p95_first_response_minutes ?? 0}m</p></Card>
          <Card className="p-3 shadow-none"><p className="text-xs text-muted-foreground">Conversion</p><p className="mt-1 text-xl font-bold">{health?.conversion_rate ?? 0}%</p></Card>
          <Card className={cn("p-3 shadow-none", Number(health?.dead_letters) > 0 && "border-destructive/50")}><p className="text-xs text-muted-foreground">Dead letters</p><p className="mt-1 text-xl font-bold">{health?.dead_letters ?? 0}</p></Card>
          <Card className={cn("p-3 shadow-none", Number(health?.days_without_capacity) > 0 && "border-amber-500/50")}><p className="text-xs text-muted-foreground">Capacity gaps</p><p className="mt-1 text-xl font-bold">{health?.days_without_capacity ?? 0}</p></Card>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-264px)] lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r bg-card">
          <div className="flex gap-1 border-b p-3">{(["open", "mine", "all"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "default" : "ghost"} onClick={() => setFilter(value)} className="capitalize">{value}</Button>)}</div>
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            {loading ? <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin" /> : visible.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground"><Inbox className="mx-auto mb-3 h-8 w-8 opacity-40" />No requests in this view.</div> : visible.map((request) => <button key={request.id} onClick={() => { setSelectedId(request.id); setMatches([]); setQuery(""); }} className={cn("w-full border-b border-l-4 border-l-transparent p-4 text-left hover:bg-muted/50", selectedId === request.id && "border-l-primary bg-primary/5")}>
              <div className="flex items-start justify-between gap-3"><Badge variant="secondary" className={cn("text-[10px] uppercase", priorityClass[request.priority])}>{request.priority}</Badge><span className="text-xs text-muted-foreground">{ageLabel(request.received_at)}</span></div>
              <p className="mt-2 truncate text-sm font-semibold">{request.subject}</p><p className="mt-1 truncate text-xs text-muted-foreground">{request.fleet_clients?.company_name || request.requester_name || "Unmatched requester"}</p>
              <div className="mt-2 flex items-center justify-between"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">{SOURCE_LABEL[request.source_type]}</span><span className={cn("h-2 w-2 rounded-md", request.assigned_to ? "bg-emerald-500" : "bg-amber-500")} /></div>
            </button>)}
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-6">
          {!selected ? <div className="flex min-h-96 items-center justify-center text-muted-foreground">Select a request</div> : <div className="mx-auto max-w-5xl space-y-4">
            <Card className="p-5 shadow-none"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{SOURCE_LABEL[selected.source_type]}</Badge><Badge variant="secondary">{STATUS_LABEL[selected.status]}</Badge></div><h2 className="mt-3 text-xl font-bold">{selected.subject}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.requester_name || "Unknown requester"}{selected.requester_email ? ` · ${selected.requester_email}` : ""}</p></div><div className="flex gap-2">{!selected.assigned_to && <Button variant="outline" disabled={working} onClick={() => execute(() => claimFleetServiceRequest(selected), "Request claimed")}><UserCheck className="mr-2 h-4 w-4" />Claim</Button>}<Select value={selected.status} onValueChange={(status: FleetRequestStatus) => execute(() => updateFleetServiceRequest(selected, { status }))}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABEL).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>{selected.request_summary && <p className="mt-5 whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-sm leading-6">{selected.request_summary}</p>}</Card>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="p-5 shadow-none"><div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><h3 className="font-semibold">Identify client or vehicle</h3></div><p className="mt-1 text-xs text-muted-foreground">Search company, contact email, unit, VIN, plate, location, or prior order.</p><div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing any account or asset identifier…" className="pl-9" />{searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" />}</div>
                {matches.length > 0 && <div className="mt-2 divide-y rounded-lg border">{matches.map((match) => { const Icon = match.entity_type === "vehicle" ? Car : match.entity_type === "location" ? MapPin : match.entity_type === "contact" ? Users : Building2; return <button key={`${match.entity_type}-${match.entity_id}`} onClick={() => linkMatch(match)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"><Icon className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{match.title}</p><p className="truncate text-xs text-muted-foreground">{match.subtitle}</p></div><Badge variant="outline" className="capitalize">{match.entity_type.replace("_", " ")}</Badge></button>; })}</div>}
                {!query && <div className="mt-5 rounded-lg border border-dashed p-5"><p className="text-sm font-medium">Current match</p>{selected.fleet_client_id ? <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{selected.fleet_clients?.company_name || "Client confirmed"}{selected.fleet_vehicles && ` · ${selected.fleet_vehicles.unit_number || `${selected.fleet_vehicles.year ?? ""} ${selected.fleet_vehicles.make ?? ""} ${selected.fleet_vehicles.model ?? ""}`}`}</div> : <div className="mt-3 flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />Client and vehicle still need confirmation</div>}</div>}
              </Card>

              <div className="space-y-4"><Card className="p-5 shadow-none"><h3 className="font-semibold">Request controls</h3><div className="mt-4 space-y-3"><div><Label>Priority</Label><Select value={selected.priority} onValueChange={(priority: FleetRequestPriority) => execute(() => updateFleetServiceRequest(selected, { priority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["routine","high","urgent","safety"].map((value) => <SelectItem value={value} key={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select></div><div className="rounded-md bg-muted/40 p-3 text-xs"><p className="flex items-center gap-2 font-medium"><Clock3 className="h-3.5 w-3.5" />Received {new Date(selected.received_at).toLocaleString()}</p><p className="mt-2 text-muted-foreground">Version {selected.version} · {selected.assigned_to ? "Owned" : "Unclaimed"}</p></div></div></Card>
                <Button className="w-full" size="lg" disabled={working || !selected.fleet_client_id || !selected.fleet_vehicle_id} onClick={() => execute(async () => { const id = await convertFleetServiceRequestToDraft(selected); navigate(`/fleet-os/work-orders/new?draft=${id}&request=${selected.id}`); })}><CheckCircle2 className="mr-2 h-4 w-4" />Create controlled draft</Button>{(!selected.fleet_client_id || !selected.fleet_vehicle_id) && <p className="text-center text-xs text-muted-foreground">Confirm both a client and vehicle to continue.</p>}</div>
            </div>
          </div>}
        </main>
      </div>
    </div>

    <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent><DialogHeader><DialogTitle>Add service request</DialogTitle></DialogHeader><div className="space-y-3"><div><Label htmlFor="request-subject">Subject</Label><Input id="request-subject" name="subject" autoComplete="off" value={draft.subject} onChange={(e) => setDraft((v) => ({ ...v, subject: e.target.value }))} placeholder="What service is being requested?" /></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="requester-name">Requester</Label><Input id="requester-name" name="name" autoComplete="name" value={draft.requester_name} onChange={(e) => setDraft((v) => ({ ...v, requester_name: e.target.value }))} /></div><div><Label htmlFor="requester-email">Email</Label><Input id="requester-email" name="email" type="email" autoComplete="email" value={draft.requester_email} onChange={(e) => setDraft((v) => ({ ...v, requester_email: e.target.value }))} /></div></div><div><Label htmlFor="request-details">Details</Label><Textarea id="request-details" name="request-details" autoComplete="off" value={draft.request_summary} onChange={(e) => setDraft((v) => ({ ...v, request_summary: e.target.value }))} rows={5} /></div></div><DialogFooter><Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button><Button disabled={working || !draft.subject.trim()} onClick={create}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add to queue</Button></DialogFooter></DialogContent></Dialog>
  </FleetOSLayout>;
}

export default function FleetServiceRequestsPage() {
  if (features["fleet-intake-kill-switch"]) return <FleetOSLayout title="Service Requests"><Card className="mx-auto max-w-lg p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><h1 className="mt-3 font-semibold">Service intake is temporarily paused</h1><p className="mt-2 text-sm text-muted-foreground">Existing records remain safe. Try again after the operational hold is cleared.</p></Card></FleetOSLayout>;
  return <FleetServiceRequestsWorkspace />;
}
