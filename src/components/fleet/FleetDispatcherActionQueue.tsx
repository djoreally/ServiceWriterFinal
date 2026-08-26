import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock3, Inbox, Loader2, RefreshCw, RotateCcw, ShieldAlert, WifiOff } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { fetchFleetFailureWorklists, fetchFleetNextActions, retryFleetOperationalFailure, type FleetFailureWorklists, type FleetNextAction } from "@/application/queries/fleet-dispatch-actions.query";

const categoryTone: Record<string, string> = {
  "SLA risk": "border-red-500/40 bg-red-500/5", "Technician exception": "border-orange-500/40 bg-orange-500/5",
  "Communication failure": "border-red-500/40 bg-red-500/5", "Billing blocked": "border-amber-500/40 bg-amber-500/5",
  "Approval waiting": "border-violet-500/40 bg-violet-500/5", "Unscheduled work": "border-blue-500/40 bg-blue-500/5",
};

export function FleetDispatcherActionQueue() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [actions, setActions] = useState<FleetNextAction[]>([]);
  const [failures, setFailures] = useState<FleetFailureWorklists | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "failed">("loading");
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const tab = params.get("view") === "failures" ? "failures" : "actions";

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState("loading");
    try {
      const [next, nextFailures] = await Promise.all([fetchFleetNextActions(), fetchFleetFailureWorklists()]);
      setActions(next.items); setFailures(nextFailures); setGeneratedAt(next.generatedAt); setError("");
      setState(next.items.length === 0 ? "empty" : "ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The dispatch queue could not be loaded.");
      setState("failed");
    }
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 30_000); return () => window.clearInterval(timer); }, [load]);
  const stale = generatedAt ? Date.now() - new Date(generatedAt).getTime() > 90_000 : false;
  const failureCount = (failures?.dead_letters.length ?? 0) + (failures?.outbox.length ?? 0) + (failures?.invoices.length ?? 0);
  const grouped = useMemo(() => actions.reduce<Record<string, FleetNextAction[]>>((map, item) => { (map[item.category] ||= []).push(item); return map; }, {}), [actions]);

  const retry = async (kind: "dead_letter" | "outbox", id: string) => {
    setRetrying(id);
    try { await retryFleetOperationalFailure(kind, id); toast.success("Retry queued"); await load(true); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Retry could not be queued"); }
    finally { setRetrying(null); }
  };

  return <Card className="overflow-hidden shadow-none">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div><div className="flex items-center gap-2"><h2 className="text-lg font-bold">Dispatcher next actions</h2>{stale && <Badge variant="destructive"><WifiOff className="mr-1 h-3 w-3"/>Stale</Badge>}</div><p className="text-sm text-muted-foreground">One prioritized queue for intake, schedule, field, approval, communication, and billing exceptions.</p></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={state === "loading"}><RefreshCw className={cn("mr-2 h-4 w-4", state === "loading" && "animate-spin")}/>Refresh</Button>
    </div>
    <Tabs value={tab} onValueChange={(value) => setParams(value === "failures" ? { view: "failures" } : {})}>
      <TabsList className="m-3"><TabsTrigger value="actions">Next actions <Badge variant="secondary" className="ml-2">{actions.length}</Badge></TabsTrigger><TabsTrigger value="failures">Operational failures {failureCount > 0 && <Badge variant="destructive" className="ml-2">{failureCount}</Badge>}</TabsTrigger></TabsList>
      <TabsContent value="actions" className="m-0">
        {state === "loading" && <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Building the prioritized queue…</div>}
        {state === "failed" && <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/5 p-5"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-destructive"/><div><p className="font-semibold">Queue unavailable</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button className="mt-3" size="sm" onClick={() => void load()}>Try again</Button></div></div></div>}
        {state === "empty" && <div className="min-h-48 p-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500"/><p className="mt-3 font-semibold">No dispatcher action is waiting</p><p className="mt-1 text-sm text-muted-foreground">This is a confirmed empty queue as of {generatedAt ? new Date(generatedAt).toLocaleTimeString() : "now"}.</p></div>}
        {state === "ready" && <div className="grid gap-3 p-4 xl:grid-cols-2">{Object.entries(grouped).map(([category, items]) => <section key={category} className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{category}</h3><Badge variant="outline">{items.length}</Badge></div>{items.map((item) => <button key={`${item.kind}-${item.entity_id}-${category}`} onClick={() => navigate(item.route)} className={cn("flex w-full items-start gap-3 rounded-lg border p-3 text-left transition hover:border-primary/50 hover:bg-muted/30", categoryTone[category])}><div className="mt-0.5 rounded-md bg-background p-2">{category === "SLA risk" ? <Clock3 className="h-4 w-4 text-destructive"/> : category.includes("failure") || category.includes("exception") ? <ShieldAlert className="h-4 w-4 text-orange-600"/> : <Inbox className="h-4 w-4 text-primary"/>}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="truncate text-sm font-semibold">{item.title}</p><Badge variant="secondary">{item.score}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle}</p><p className="mt-2 text-[11px] text-muted-foreground">Waiting since {new Date(item.occurred_at).toLocaleString()}</p></div></button>)}</section>)}</div>}
      </TabsContent>
      <TabsContent value="failures" className="m-0 p-4">
        {!failures ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin"/></div> : failureCount === 0 ? <div className="min-h-40 p-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500"/><p className="mt-2 font-semibold">No unresolved operational failures</p><p className="text-sm text-muted-foreground">Dead letters, delivery failures, and invoice failures are clear.</p></div> : <div className="grid gap-4 lg:grid-cols-3">
          <FailureColumn title="Intake dead letters" items={failures.dead_letters} empty="No failed intake" render={(item) => <Button size="sm" variant="outline" disabled={retrying === item.id} onClick={() => void retry("dead_letter", item.id)}><RotateCcw className="mr-1 h-3.5 w-3.5"/>Replay</Button>}/>
          <FailureColumn title="Communication delivery" items={failures.outbox} empty="No delivery failures" render={(item) => <Button size="sm" variant="outline" disabled={retrying === item.id} onClick={() => void retry("outbox", item.id)}><RotateCcw className="mr-1 h-3.5 w-3.5"/>Retry</Button>}/>
          <FailureColumn title="Invoice delivery" items={failures.invoices} empty="No invoice failures" render={(item) => <Button size="sm" variant="outline" onClick={() => navigate(`/fleet-os/invoices?invoice=${item.id}`)}>Open invoice</Button>}/>
        </div>}
      </TabsContent>
    </Tabs>
  </Card>;
}

function FailureColumn({ title, items, empty, render }: { title: string; items: FleetFailureWorklists["dead_letters"]; empty: string; render: (item: FleetFailureWorklists["dead_letters"][number]) => ReactNode }) {
  return <section><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><Badge variant={items.length ? "destructive" : "secondary"}>{items.length}</Badge></div><div className="space-y-2">{items.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">{empty}</div> : items.map((item) => <div key={item.id} className="rounded-lg border border-destructive/30 p-3"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive"/><div className="min-w-0"><p className="truncate text-sm font-medium">{item.source_type || item.event_type || item.invoice_number || "Operational failure"}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.error_message || item.last_error || item.delivery_last_error || item.company_name || "Needs operator review"}</p></div></div><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">{item.attempts ?? item.delivery_attempt_count ?? 0} attempt(s)</span>{render(item)}</div></div>)}</div></section>;
}
