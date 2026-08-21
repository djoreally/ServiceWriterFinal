import { useEffect, useState, useCallback } from "react";
import {
  insertRetentionEvents,
  retryQueuedEmail,
  invokeRetentionWorker,
} from "@/application/commands/retention-verification.command";
import {
  fetchRetentionVerificationSnapshot,
  fetchTodaysCompletedServices,
  fetchExistingRetentionEventAggregateIds,
  type RetentionVerificationCounts,
  type RetentionVerificationRow,
} from "@/application/queries/retention-verification.query";
import { useAuth } from "@packages/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Counts = RetentionVerificationCounts;
type Row = Record<string, any>;

export default function RetentionVerify() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recentEvents, setRecentEvents] = useState<Row[]>([]);
  const [recentActions, setRecentActions] = useState<Row[]>([]);
  const [recentEmails, setRecentEmails] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [workerResult, setWorkerResult] = useState<any>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const retryEmail = async (emailQueueId: string) => {
    setRetryingId(emailQueueId);
    try {
      await retryQueuedEmail(emailQueueId);
      toast({ title: "Retry queued", description: "Worker re-invoked. Refresh in a few seconds." });
      await refresh();
    } catch (err: any) {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    } finally {
      setRetryingId(null);
    }
  };

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const snapshot = await fetchRetentionVerificationSnapshot(user.id);
      setCounts(snapshot.counts);
      setRecentEvents(snapshot.recentEvents as Row[]);
      setRecentActions(snapshot.recentActions as Row[]);
      setRecentEmails(snapshot.recentEmails as Row[]);
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runVerification = async () => {
    if (!user?.id) return;
    setRunning(true);
    setWorkerResult(null);
    try {
      // 1. Backfill today's completed services as retention_events (idempotent)
      const completed = await fetchTodaysCompletedServices(user.id);

      const eventRows = completed.map((s) => ({
        event_name: "service_order.completed",
        aggregate_type: "service",
        aggregate_id: s.id,
        user_id: user.id!,
        customer_id: s.customer_id,
        vehicle_id: s.vehicle_id,
        payload_jsonb: { total_cost: s.total_cost, service_date: s.service_date },
        occurred_at: new Date().toISOString(),
      }));

      let backfilled = 0;
      if (eventRows.length) {
        const aggIds = eventRows.map((r) => r.aggregate_id);
        const existingSet = await fetchExistingRetentionEventAggregateIds(user.id, aggIds);
        const toInsert = eventRows.filter((r) => !existingSet.has(r.aggregate_id));
        if (toInsert.length) {
          await insertRetentionEvents(toInsert);
          backfilled = toInsert.length;
        }
      }

      // 2. Invoke retention worker
      const workerData = await invokeRetentionWorker(user.id);
      setWorkerResult({ backfilled, ...(workerData as Record<string, unknown> ?? {}) });

      toast({
        title: "Verification complete",
        description: `Backfilled ${backfilled} event(s). Worker processed: ${JSON.stringify(workerData ?? {})}`,
      });
      setLastRun(new Date().toISOString());
      await refresh();
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
      setWorkerResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  const StatCard = ({ label, value, ok }: { label: string; value: number; ok?: boolean }) => (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-3xl font-semibold mt-1 flex items-center gap-2">
          {value}
          {ok !== undefined && (ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-muted-foreground" />)}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Retention Verification</h1>
          <p className="text-sm text-muted-foreground">
            One-click check that today's events are queued and review-request emails are firing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={runVerification} disabled={running || !user?.id}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Run Verification
          </Button>
        </div>
      </div>

      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Services completed today" value={counts.servicesCompleted} />
          <StatCard label="Retention events today" value={counts.retentionEvents} ok={counts.retentionEvents >= counts.servicesCompleted} />
          <StatCard label="Review actions executed" value={counts.reviewActions} ok={counts.reviewActions > 0 || counts.servicesCompleted === 0} />
          <StatCard label="Review requests created" value={counts.reviewRequests} />
          <StatCard label="Review emails queued" value={counts.reviewEmailsQueued} />
          <StatCard label="Review emails sent" value={counts.reviewEmailsSent} ok={counts.reviewEmailsSent > 0 || counts.reviewEmailsQueued === 0} />
        </div>
      )}

      {workerResult && (
        <Card>
          <CardHeader><CardTitle className="text-base">Last worker response</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">{JSON.stringify(workerResult, null, 2)}</pre>
            {lastRun && <p className="text-xs text-muted-foreground mt-2">Ran {format(new Date(lastRun), "PPpp")}</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent retention events</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {recentEvents.length === 0 && <p className="text-muted-foreground">None today.</p>}
            {recentEvents.map((e) => (
              <div key={e.id} className="border rounded p-2">
                <div className="font-mono">{e.event_name}</div>
                <div className="text-muted-foreground">{format(new Date(e.occurred_at), "p")}</div>
                <Badge variant={e.processed_at ? "default" : "secondary"} className="mt-1">
                  {e.processed_at ? "processed" : "pending"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recent action executions</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {recentActions.length === 0 && <p className="text-muted-foreground">None today.</p>}
            {recentActions.map((a) => (
              <div key={a.id} className="border rounded p-2">
                <div className="font-mono">{a.action_type}</div>
                <Badge variant={a.status === "completed" ? "default" : a.status === "failed" ? "destructive" : "secondary"} className="mt-1">
                  {a.status}
                </Badge>
                <div className="text-muted-foreground mt-1">
                  {a.executed_at ? `Executed ${format(new Date(a.executed_at), "p")}` : `Created ${format(new Date(a.created_at), "p")}`}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Review request emails</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {recentEmails.length === 0 && <p className="text-muted-foreground">None today.</p>}
            {recentEmails.map((m) => {
              const isFailed = m.status === "failed" || m.status === "dlq";
              return (
                <div key={m.id} className="border rounded p-2">
                  <div className="truncate">{m.recipient_email}</div>
                  <Badge
                    variant={m.status === "sent" ? "default" : isFailed ? "destructive" : "secondary"}
                    className="mt-1"
                  >
                    {m.status}
                  </Badge>
                  <div className="text-muted-foreground mt-1">
                    {m.sent_at ? `Sent ${format(new Date(m.sent_at), "p")}` : `Scheduled ${format(new Date(m.scheduled_for), "p")}`}
                  </div>
                  {m.error_message && <div className="text-destructive mt-1 break-all">{m.error_message}</div>}
                  {isFailed && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 text-xs gap-1"
                      onClick={() => retryEmail(m.id)}
                      disabled={retryingId === m.id}
                    >
                      {retryingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Retry now
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
