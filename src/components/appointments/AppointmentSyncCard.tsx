/**
 * AppointmentSyncCard — Per-appointment provider sync UI with Realtime updates
 * and a manual "Sync this appointment" action.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, CheckCircle2, AlertTriangle, Loader2, Activity,
  Clock, XCircle, Send,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  fetchAppointmentSyncRecords,
  fetchAppointmentSyncLogs,
  subscribeAppointmentSyncChannel,
} from "@/application/queries/appointment-sync.query";
import type { ProviderSyncRecord, ProviderSyncLog } from "@/application/queries/provider-sync.query";
import { triggerManualAppointmentSync } from "@/application/commands/provider-sync.command";
import {
  fetchSyncFunctionVersion,
  type SyncFunctionVersion,
} from "@/application/queries/sync-function-version.query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const REFRESH_FALLBACK_MS = 30_000;

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    const f = -ms;
    if (f < 60_000) return `in ${Math.ceil(f / 1000)}s`;
    if (f < 3_600_000) return `in ${Math.ceil(f / 60_000)}m`;
    return `in ${Math.ceil(f / 3_600_000)}h`;
  }
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ record }: { record: ProviderSyncRecord }) {
  if (record.dead_letter) {
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Dead-letter</Badge>;
  }
  if (record.sync_status === "succeeded") {
    return <Badge variant="outline" className="gap-1 border-primary/30"><CheckCircle2 className="h-3 w-3" />Synced</Badge>;
  }
  if (record.sync_status === "failed") {
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Failed</Badge>;
  }
  if (record.sync_status === "processing") {
    return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
  }
  if (record.sync_status === ("throttled" as ProviderSyncRecord["sync_status"])) {
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Throttled</Badge>;
  }
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}

interface AppointmentSyncCardProps {
  appointmentId: string;
}

export function AppointmentSyncCard({ appointmentId }: AppointmentSyncCardProps) {
  const [records, setRecords] = useState<ProviderSyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [activeLogs, setActiveLogs] = useState<ProviderSyncLog[]>([]);
  const [activeRecord, setActiveRecord] = useState<ProviderSyncRecord | null>(null);
  const [now, setNow] = useState(Date.now());
  const [fnVersion, setFnVersion] = useState<SyncFunctionVersion | null>(null);
  const [fnVersionError, setFnVersionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAppointmentSyncRecords(appointmentId);
      setRecords(data);
    } catch (err) {
      console.error("Appointment sync refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  const refreshVersion = useCallback(async () => {
    try {
      const v = await fetchSyncFunctionVersion();
      setFnVersion(v);
      setFnVersionError(null);
    } catch (err) {
      setFnVersion(null);
      setFnVersionError(err instanceof Error ? err.message : "Probe failed");
    }
  }, []);

  // Initial + fallback refresh
  useEffect(() => {
    void refresh();
    void refreshVersion();
    const interval = setInterval(() => { void refresh(); }, REFRESH_FALLBACK_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(interval); clearInterval(tick); };
  }, [refresh, refreshVersion]);

  // Realtime subscription for instant status updates
  useEffect(() => {
    const unsubscribe = subscribeAppointmentSyncChannel(appointmentId, () => {
      void refresh();
    });
    return unsubscribe;
  }, [appointmentId, refresh]);

  const latest = records[0] || null;
  const countdown = useMemo(() => {
    if (!latest?.next_retry_at) return null;
    const diff = new Date(latest.next_retry_at).getTime() - now;
    if (diff <= 0) return null;
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }, [latest, now]);

  const handleSync = useCallback(async function syncAppointment() {
    setSyncing(true);
    // Refresh the version probe in the background so the badge in the header
    // reflects what the running function actually exposes right now.
    void refreshVersion();
    try {
      const { data, error } = await triggerManualAppointmentSync(appointmentId);
      if (error) throw error;
      const versionFromResponse =
        data && typeof data === "object" && "version" in (data as Record<string, unknown>)
          ? String((data as Record<string, unknown>).version)
          : null;
      toast.success("Sync started", {
        description: versionFromResponse ? `Function v${versionFromResponse}` : undefined,
      });
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      toast.error("Sync failed", {
        description: message,
        action: {
          label: "Retry",
          onClick: () => { void syncAppointment(); },
        },
      });
    } finally {
      setSyncing(false);
    }
  }, [appointmentId, refresh, refreshVersion]);

  const handleViewLogs = useCallback(async (record: ProviderSyncRecord) => {
    setActiveRecord(record);
    setLogsOpen(true);
    setActiveLogs([]);
    try {
      const logs = await fetchAppointmentSyncLogs(record.id);
      setActiveLogs(logs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load logs");
    }
  }, []);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Provider Sync
          </CardTitle>
          {fnVersion ? (
            <Badge
              variant="outline"
              className="font-mono text-[10px] gap-1"
              title={`Built ${fnVersion.built_at}`}
            >
              <CheckCircle2 className="h-3 w-3 text-primary" />
              v{fnVersion.version}
            </Badge>
          ) : fnVersionError ? (
            <Badge variant="destructive" className="text-[10px] gap-1" title={fnVersionError}>
              <AlertTriangle className="h-3 w-3" />
              fn unreachable
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              probing…
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : !latest ? (
          <p className="text-sm text-muted-foreground">
            No sync attempted yet. Click below to push this appointment to your payment provider.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge record={latest} />
              <Badge variant="outline" className="capitalize">{latest.provider}</Badge>
              {latest.attempt_count > 1 && (
                <span className="text-xs text-muted-foreground">attempt {latest.attempt_count}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono space-y-1">
              {latest.external_invoice_id && <p className="truncate">invoice: {latest.external_invoice_id}</p>}
              {latest.external_order_id && <p className="truncate">order: {latest.external_order_id}</p>}
              {latest.external_payment_id && <p className="truncate">payment: {latest.external_payment_id}</p>}
            </div>
            {latest.last_error && (
              <p className="text-xs text-destructive break-words" title={latest.last_error}>
                {latest.last_error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Last attempt {formatRelative(latest.last_attempt_at || latest.updated_at)}
              {countdown && (
                <> · next retry in {countdown}</>
              )}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="default"
            onClick={() => void handleSync()}
            disabled={syncing || latest?.sync_status === "processing"}
            className="gap-2 flex-1"
          >
            {syncing || latest?.sync_status === "processing"
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
            {countdown ? `Queued — ${countdown}` : "Sync this appointment"}
          </Button>
          {latest && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleViewLogs(latest)}
              className="gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              Logs
            </Button>
          )}
        </div>
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
                        <span className="text-xs text-muted-foreground">attempt {log.attempt_number}</span>
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

export default AppointmentSyncCard;
