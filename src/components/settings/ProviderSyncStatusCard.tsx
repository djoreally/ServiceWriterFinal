import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Activity,
  Clock,
  XCircle,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchProviderSyncSummary,
  fetchProviderSyncRecords,
  fetchProviderSyncLogs,
  type ProviderSyncSummary,
  type ProviderSyncRecord,
  type ProviderSyncLog,
} from "@/application/queries/provider-sync.query";
import {
  retryProviderSyncRecord,
  retryAllFailedProviderSyncs,
} from "@/application/commands/provider-sync-manager.command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const REFRESH_INTERVAL_MS = 30_000;

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    const future = -ms;
    if (future < 60_000) return `in ${Math.ceil(future / 1000)}s`;
    if (future < 3_600_000) return `in ${Math.ceil(future / 60_000)}m`;
    return `in ${Math.ceil(future / 3_600_000)}h`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusBadge({ record }: { record: ProviderSyncRecord }) {
  if (record.dead_letter) {
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Dead-letter</Badge>;
  }
  if (record.sync_status === "succeeded") {
    return <Badge variant="outline" className="gap-1 border-primary/30 text-foreground"><CheckCircle2 className="h-3 w-3" />Synced</Badge>;
  }
  if (record.sync_status === "failed") {
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Failed</Badge>;
  }
  if (record.sync_status === "processing") {
    return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
  }
  if (record.sync_status === "throttled") {
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Throttled</Badge>;
  }
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}

export function ProviderSyncStatusCard() {
  const [summary, setSummary] = useState<ProviderSyncSummary | null>(null);
  const [records, setRecords] = useState<ProviderSyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "failed" | "succeeded">("all");
  const [logsOpen, setLogsOpen] = useState(false);
  const [activeLogs, setActiveLogs] = useState<ProviderSyncLog[]>([]);
  const [activeRecord, setActiveRecord] = useState<ProviderSyncRecord | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        fetchProviderSyncSummary(),
        fetchProviderSyncRecords({
          status: filter === "all" ? undefined : filter,
          limit: 25,
        }),
      ]);
      setSummary(s);
      setRecords(r);
    } catch (err) {
      console.error("Provider sync refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
    const interval = setInterval((): void => { void refresh(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRetry = useCallback(async (record: ProviderSyncRecord) => {
    setBusyId(record.id);
    try {
      await retryProviderSyncRecord(record.id);
      toast.success("Sync retried");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const handleRetryAll = useCallback(async () => {
    setRetryingAll(true);
    try {
      const result = await retryAllFailedProviderSyncs();
      toast.success(`Retried ${result.retried ?? 0} failed sync${result.retried === 1 ? "" : "s"}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk retry failed");
    } finally {
      setRetryingAll(false);
    }
  }, [refresh]);

  const handleViewLogs = useCallback(async (record: ProviderSyncRecord) => {
    setActiveRecord(record);
    setLogsOpen(true);
    setActiveLogs([]);
    try {
      const logs = await fetchProviderSyncLogs(record.id);
      setActiveLogs(logs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load logs");
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Payment Provider Sync
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Status and audit log of every Stripe / Square push.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            {summary && summary.failed > 0 && (
              <Button
                size="sm"
                variant="default"
                onClick={() => void handleRetryAll()}
                disabled={retryingAll}
                className="gap-2"
              >
                {retryingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Retry all ({summary.failed})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metric strip */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Metric label="Total" value={summary.total} tone="neutral" />
            <Metric label="Synced" value={summary.succeeded} tone="ok" />
            <Metric label="Pending" value={summary.pending + summary.processing} tone={summary.pending + summary.processing > 0 ? "warn" : "ok"} />
            <Metric label="Failed" value={summary.failed} tone={summary.failed > 0 ? "warn" : "ok"} />
            <Metric label="Dead-letter" value={summary.dead_letter} tone={summary.dead_letter > 0 ? "error" : "ok"} />
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2">
          {(["all", "failed", "succeeded"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>

        {/* Records list */}
        {records.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Inbox className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No sync records yet — they appear here as appointments are booked.
          </div>
        ) : (
          <div className="border rounded-md divide-y">
            {records.map((record) => (
              <div key={record.id} className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge record={record} />
                    <Badge variant="outline" className="capitalize">{record.provider}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {record.sync_mode}
                    </span>
                    {record.attempt_count > 1 && (
                      <span className="text-xs text-muted-foreground">
                        attempt {record.attempt_count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                    appt: {record.appointment_id.slice(0, 8)}…
                    {record.external_invoice_id && <> · invoice: {record.external_invoice_id.slice(0, 14)}…</>}
                    {record.external_order_id && <> · order: {record.external_order_id.slice(0, 14)}…</>}
                  </p>
                  {record.last_error && (
                    <p className="text-xs text-destructive mt-1 truncate" title={record.last_error}>
                      {record.last_error}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Updated {formatRelative(record.updated_at)}
                    {record.next_retry_at && record.sync_status === "failed" && (
                      <> · next retry {formatRelative(record.next_retry_at)}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleViewLogs(record)}
                  >
                    Logs
                  </Button>
                  {(record.sync_status === "failed" || record.dead_letter) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRetry(record)}
                      disabled={busyId === record.id}
                      className="gap-1"
                    >
                      {busyId === record.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sync attempt history</DialogTitle>
            {activeRecord && (
              <p className="text-xs text-muted-foreground font-mono">
                {activeRecord.provider} · {activeRecord.sync_mode} · {activeRecord.id.slice(0, 8)}…
              </p>
            )}
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {activeLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No attempts logged yet.</p>
            ) : (
              <div className="space-y-2">
                {activeLogs.map((log) => (
                  <div key={log.id} className="border rounded-md p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={log.status === "succeeded" ? "outline" : log.status === "failed" ? "destructive" : "secondary"}>
                          {log.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          attempt {log.attempt_number}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(log.created_at)}
                        {log.duration_ms != null && <> · {log.duration_ms}ms</>}
                      </span>
                    </div>
                    {log.error_message && (
                      <p className="text-xs text-destructive mt-2 break-all">{log.error_message}</p>
                    )}
                    {log.context && Object.keys(log.context).length > 0 && (
                      <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(log.context, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "error" | "neutral" }) {
  const colorClass =
    tone === "error" ? "text-destructive" :
    tone === "warn" ? "text-orange-600 dark:text-orange-400" :
    tone === "ok" ? "text-foreground" :
    "text-foreground";
  return (
    <div className="border rounded-md p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${colorClass}`}>{value}</p>
    </div>
  );
}

export default ProviderSyncStatusCard;
