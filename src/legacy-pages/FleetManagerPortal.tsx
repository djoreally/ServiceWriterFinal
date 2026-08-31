import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, BarChart3, Building2, Car, CheckCircle2, FileCheck2, FileText, Loader2, LogOut, Plus, RefreshCw, Wrench } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@packages/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createFleetPortalRequest, fetchFleetManagerPortal, respondFleetPortalApproval, type FleetManagerPortal } from "@/application/queries/fleet-manager-portal.query";

export default function FleetManagerPortal() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [portal, setPortal] = useState<FleetManagerPortal | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [error, setError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [draft, setDraft] = useState({ vehicleId: "none", subject: "", summary: "", priority: "routine" });

  const load = useCallback(async (clientId?: string) => {
    setState("loading");
    try { const data = await fetchFleetManagerPortal(clientId); setPortal(data); setError(""); setState("ready"); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "Fleet portal unavailable"; setError(message); setState(message.includes("access_denied") || message.includes("account_required") ? "denied" : "failed"); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!session) { void Promise.resolve().then(() => navigate("/fleet-manager/auth?returnTo=/fleet-manager", { replace: true })); return; }
    void Promise.resolve().then(() => load());
  }, [authLoading, session, navigate, load]);

  const vehicleById = useMemo(() => new Map((portal?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle])), [portal?.vehicles]);
  const submitRequest = async () => {
    if (!portal || !draft.subject.trim()) return;
    setWorking(true);
    try { await createFleetPortalRequest({ clientId: portal.selected_client_id, vehicleId: draft.vehicleId === "none" ? undefined : draft.vehicleId, subject: draft.subject.trim(), summary: draft.summary.trim(), priority: draft.priority }); toast.success("Service request submitted to dispatch"); setRequestOpen(false); setDraft({ vehicleId: "none", subject: "", summary: "", priority: "routine" }); await load(portal.selected_client_id); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Request could not be submitted"); }
    finally { setWorking(false); }
  };
  const respond = async (id: string, status: "approved" | "rejected") => {
    if (!portal) return; setWorking(true);
    try { await respondFleetPortalApproval(id, status); toast.success(`Approval ${status}`); await load(portal.selected_client_id); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Approval could not be updated"); }
    finally { setWorking(false); }
  };

  if (authLoading || state === "loading") return <PortalShell><div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin"/>Loading your fleet workspace…</div></PortalShell>;
  if (state === "denied") return <PortalShell><Card className="mx-auto mt-16 max-w-xl p-8 text-center"><AlertCircle className="mx-auto h-10 w-10 text-amber-500"/><h1 className="mt-4 text-xl font-bold">Fleet access has not been enabled</h1><p className="mt-2 text-sm text-muted-foreground">Your verified account email must match an active Fleet contact whose company has portal access enabled. Ask your service provider to confirm the contact and permissions.</p><Button className="mt-5" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4"/>Check again</Button></Card></PortalShell>;
  if (state === "failed" || !portal) return <PortalShell><Card className="mx-auto mt-16 max-w-xl border-destructive/40 p-8 text-center"><AlertCircle className="mx-auto h-10 w-10 text-destructive"/><h1 className="mt-4 text-xl font-bold">Fleet portal unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button className="mt-5" onClick={() => void load()}>Try again</Button></Card></PortalShell>;

  return <PortalShell onSignOut={async () => { const { supabase } = await import("@/integrations/supabase/client"); await supabase.auth.signOut(); navigate("/fleet-manager/auth"); }}>
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Fleet Manager</p><h1 className="mt-1 text-3xl font-bold">Your service workspace</h1><p className="mt-1 text-sm text-muted-foreground">Request service, approve work, follow vehicles, and review billing without entering the provider’s operations system.</p></div><div className="flex gap-2">{portal.clients.length > 1 && <Select value={portal.selected_client_id} onValueChange={(id) => void load(id)}><SelectTrigger className="w-56"><SelectValue/></SelectTrigger><SelectContent>{portal.clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>)}</SelectContent></Select>}{portal.permissions.request_service && <Button onClick={() => setRequestOpen(true)}><Plus className="mr-2 h-4 w-4"/>Request service</Button>}</div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Active vehicles" value={portal.reports.active_vehicles} icon={Car}/><Metric label="Open work" value={portal.reports.open_work} icon={Wrench}/><Metric label="Completed work" value={portal.reports.completed_work} icon={CheckCircle2}/><Metric label="Outstanding" value={`$${Number(portal.reports.outstanding_balance).toLocaleString(undefined,{minimumFractionDigits:2})}`} icon={FileText}/></div>
      <Tabs defaultValue="vehicles"><TabsList className="h-auto flex-wrap"><TabsTrigger value="vehicles">Vehicles</TabsTrigger><TabsTrigger value="requests">Requests</TabsTrigger><TabsTrigger value="work">Work tracking</TabsTrigger><TabsTrigger value="approvals">Approvals {portal.approvals.filter((a) => a.status === "pending").length > 0 && <Badge className="ml-2">{portal.approvals.filter((a) => a.status === "pending").length}</Badge>}</TabsTrigger><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="reports">Reports</TabsTrigger></TabsList>
        <TabsContent value="vehicles"><PortalList empty={portal.permissions.view_vehicles ? "No vehicles are linked to this account." : "Your contact does not have vehicle-view permission."}>{portal.vehicles.map((v) => <Card key={v.id} className="p-4 shadow-none"><div className="flex justify-between gap-3"><div><p className="font-semibold">{v.unit_number || [v.year,v.make,v.model].filter(Boolean).join(" ")}</p><p className="text-sm text-muted-foreground">{[v.year,v.make,v.model].filter(Boolean).join(" ")} · {v.license_plate || v.vin || "Identifier pending"}</p></div><Badge variant="outline">{v.status}</Badge></div></Card>)}</PortalList></TabsContent>
        <TabsContent value="requests"><PortalList empty="No service requests have been submitted from your Fleet portal.">{portal.requests.map((r) => <Card key={r.id} className="p-4 shadow-none"><div className="flex justify-between gap-3"><div><p className="font-semibold">{r.subject}</p><p className="text-sm text-muted-foreground">{r.vehicle_id ? vehicleById.get(r.vehicle_id)?.unit_number || "Linked vehicle" : "Vehicle not selected"} · {new Date(r.received_at).toLocaleString()}</p></div><div className="flex gap-2"><Badge variant="outline">{r.priority}</Badge><Badge>{r.status.replaceAll("_"," ")}</Badge></div></div></Card>)}</PortalList></TabsContent>
        <TabsContent value="work"><PortalList empty={portal.permissions.view_service_history ? "No Fleet work is available." : "Your contact does not have service-history permission."}>{portal.work_orders.map((w) => <Card key={w.id} className="p-4 shadow-none"><div className="flex justify-between gap-3"><div><p className="font-semibold">{w.order_number || w.service_type || "Fleet service"}</p><p className="text-sm text-muted-foreground">{w.service_type} · {w.scheduled_date ? `${w.scheduled_date} ${w.scheduled_time?.slice(0,5) || ""}` : "Scheduling pending"}</p></div><Badge>{w.status.replaceAll("_"," ")}</Badge></div></Card>)}</PortalList></TabsContent>
        <TabsContent value="approvals"><PortalList empty={portal.permissions.approve_work ? "No approvals are waiting." : "Your contact does not have approval permission."}>{portal.approvals.map((a) => <Card key={a.id} className="p-4 shadow-none"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold">{a.title}</p><p className="mt-1 text-sm text-muted-foreground">{a.description}</p>{a.estimated_cost != null && <p className="mt-2 text-sm font-semibold">Estimated ${Number(a.estimated_cost).toFixed(2)}</p>}</div>{a.status === "pending" ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={working} onClick={() => void respond(a.id,"rejected")}>Decline</Button><Button size="sm" disabled={working} onClick={() => void respond(a.id,"approved")}>Approve</Button></div> : <Badge>{a.status}</Badge>}</div></Card>)}</PortalList></TabsContent>
        <TabsContent value="invoices"><PortalList empty={portal.permissions.receive_invoices ? "No invoices are available." : "Your contact does not receive invoices."}>{portal.invoices.map((i) => <Card key={i.id} className="p-4 shadow-none"><div className="flex justify-between gap-3"><div><p className="font-semibold">{i.invoice_number}</p><p className="text-sm text-muted-foreground">Issued {i.issue_date} · Due {i.due_date || "on receipt"}</p></div><div className="text-right"><Badge>{i.status}</Badge><p className="mt-2 font-bold">${Number(i.total).toFixed(2)}</p></div></div></Card>)}</PortalList></TabsContent>
        <TabsContent value="reports"><div className="grid gap-4 md:grid-cols-2"><Card className="p-5 shadow-none"><BarChart3 className="h-5 w-5 text-primary"/><h2 className="mt-3 font-semibold">Service activity</h2><p className="mt-1 text-sm text-muted-foreground">{portal.reports.open_work} open and {portal.reports.completed_work} completed work orders across this fleet account.</p></Card><Card className="p-5 shadow-none"><FileCheck2 className="h-5 w-5 text-primary"/><h2 className="mt-3 font-semibold">Account balance</h2><p className="mt-1 text-sm text-muted-foreground">${Number(portal.reports.outstanding_balance).toFixed(2)} remains outstanding on available fleet invoices.</p></Card></div></TabsContent>
      </Tabs>
    </div>
    <Dialog open={requestOpen} onOpenChange={setRequestOpen}><DialogContent><DialogHeader><DialogTitle>Request Fleet service</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Vehicle</Label><Select value={draft.vehicleId} onValueChange={(vehicleId) => setDraft((v) => ({...v,vehicleId}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Not sure / dispatch to identify</SelectItem>{portal.vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.unit_number || [v.year,v.make,v.model].filter(Boolean).join(" ")}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="fleet-request-subject">Service needed</Label><Input id="fleet-request-subject" autoComplete="off" value={draft.subject} onChange={(e) => setDraft((v) => ({...v,subject:e.target.value}))}/></div><div><Label>Priority</Label><Select value={draft.priority} onValueChange={(priority) => setDraft((v) => ({...v,priority}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="routine">Routine</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="safety">Safety concern</SelectItem></SelectContent></Select></div><div><Label htmlFor="fleet-request-details">Details</Label><Textarea id="fleet-request-details" autoComplete="off" rows={5} value={draft.summary} onChange={(e) => setDraft((v) => ({...v,summary:e.target.value}))}/></div></div><DialogFooter><Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button><Button disabled={working || !draft.subject.trim()} onClick={() => void submitRequest()}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Send to dispatch</Button></DialogFooter></DialogContent></Dialog>
  </PortalShell>;
}

function PortalShell({ children, onSignOut }: { children: ReactNode; onSignOut?: () => void }) { return <div className="min-h-screen bg-muted/20"><header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4"><div className="flex items-center gap-2 font-bold"><div className="rounded-lg bg-primary p-2 text-primary-foreground"><Building2 className="h-4 w-4"/></div>Fleet Manager Portal</div>{onSignOut && <Button variant="ghost" size="sm" onClick={onSignOut}><LogOut className="mr-2 h-4 w-4"/>Sign out</Button>}</div></header>{children}</div>; }
function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Car }) { return <Card className="p-4 shadow-none"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><Icon className="h-5 w-5 text-primary"/></div></Card>; }
function PortalList({ children, empty }: { children: ReactNode[]; empty: string }) { return <div className="mt-4 space-y-2">{children.length ? children : <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">{empty}</Card>}</div>; }
