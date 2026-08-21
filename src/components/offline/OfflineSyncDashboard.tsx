import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Loader2, Trash2, RotateCcw } from "lucide-react";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import type { OfflineObservabilitySnapshot } from "@/offline/observability";
import { toast } from "sonner";

const REFRESH_INTERVAL_MS = 30_000;

interface OfflineDashboardDeps {
  getOfflineObservabilitySnapshot: () => Promise<OfflineObservabilitySnapshot>;
  getSyncCursorSnapshot: () => Promise<Record<string, string | null>>;
  getDeadLetterOutboxItems: () => Promise<any[]>;
  retryDeadLetterOutboxItem: (mutationId: string) => Promise<void>;
  discardDeadLetterOutboxItem: (mutationId: string) => Promise<void>;
}

let offlineDashboardDepsPromise: Promise<OfflineDashboardDeps> | null = null;

function loadOfflineDashboardDeps(): Promise<OfflineDashboardDeps> {
  // Dormancy contract: keep heavy offline internals out of the initial path.
  // Imports are deferred so disabled dashboards do not load/execute offline modules.
  if (!offlineDashboardDepsPromise) {
    offlineDashboardDepsPromise = Promise.all([
      import("@/offline/observability"),
      import("@/offline/outbox"),
    ]).then(([observability, outbox]) => ({
      getOfflineObservabilitySnapshot: observability.getOfflineObservabilitySnapshot,
      getSyncCursorSnapshot: observability.getSyncCursorSnapshot,
      getDeadLetterOutboxItems: outbox.getDeadLetterOutboxItems,
      retryDeadLetterOutboxItem: outbox.retryDeadLetterOutboxItem,
      discardDeadLetterOutboxItem: outbox.discardDeadLetterOutboxItem,
    }));
  }

  return offlineDashboardDepsPromise;
}

function formatAge(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatCursor(cursor: string | null): string {
  if (!cursor) return "never synced";
  const date = new Date(cursor);
  if (Number.isNaN(date.getTime())) return cursor;
  return date.toLocaleString();
}

export function OfflineSyncDashboard() {
  // Dashboard is gated by canonical current-user eligibility, not visibility alone.
  const [isOfflineDashboardEnabled, setIsOfflineDashboardEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<OfflineObservabilitySnapshot | null>(null);
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [deadLetterItems, setDeadLetterItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void isOfflineEligibleForCurrentUser()
      .then((eligible) => {
        if (isActive) {
          setIsOfflineDashboardEnabled(eligible);
          if (!eligible) {
            setLoading(false);
          }
        }
      })
      .catch(() => {
        if (isActive) {
          setIsOfflineDashboardEnabled(false);
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    // Disabled must mean no reads/processing side effects.
    if (!isOfflineDashboardEnabled) {
      return;
    }

    try {
      const deps = await loadOfflineDashboardDeps();
      const [snap, cursorSnap, deadItems] = await Promise.all([
        deps.getOfflineObservabilitySnapshot(),
        deps.getSyncCursorSnapshot(),
        deps.getDeadLetterOutboxItems(),
      ]);
      setSnapshot(snap);
      setCursors(cursorSnap);
      setDeadLetterItems(deadItems);
    } finally {
      setLoading(false);
    }
  }, [isOfflineDashboardEnabled]);

  useEffect(() => {
    if (!isOfflineDashboardEnabled) {
      setLoading(false);
      return;
    }

    void refresh();
    const interval = setInterval((): void => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isOfflineDashboardEnabled, refresh]);

  const handleRetry = useCallback(async (mutationId: string) => {
    if (!isOfflineDashboardEnabled) {
      return;
    }

    setActionInProgress(mutationId);
    try {
      const deps = await loadOfflineDashboardDeps();
      await deps.retryDeadLetterOutboxItem(mutationId);
      toast.success("Item re-queued for retry");
      await refresh();
    } catch {
      toast.error("Failed to retry item");
    } finally {
      setActionInProgress(null);
    }
  }, [isOfflineDashboardEnabled, refresh]);

  const handleDiscard = useCallback(async (mutationId: string) => {
    if (!isOfflineDashboardEnabled) {
      return;
    }

    setActionInProgress(mutationId);
    try {
      const deps = await loadOfflineDashboardDeps();
      await deps.discardDeadLetterOutboxItem(mutationId);
      toast.success("Item discarded");
      await refresh();
    } catch {
      toast.error("Failed to discard item");
    } finally {
      setActionInProgress(null);
    }
  }, [isOfflineDashboardEnabled, refresh]);

  if (!isOfflineDashboardEnabled) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Offline Sync Status</h3>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Outbox metrics */}
      {snapshot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Pending"
            value={snapshot.pending}
            variant={snapshot.pending > 0 ? "warning" : "ok"}
          />
          <MetricCard
            label="Failed"
            value={snapshot.failed}
            variant={snapshot.failed > 0 ? "warning" : "ok"}
          />
          <MetricCard
            label="Dead-letter"
            value={snapshot.deadLetter}
            variant={snapshot.deadLetter > 0 ? "error" : "ok"}
          />
          <MetricCard
            label="Synced"
            value={snapshot.synced}
            variant="neutral"
          />
        </div>
      )}

      {snapshot && snapshot.oldestPendingAgeMs > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Oldest pending item: <span className="font-medium text-foreground">{formatAge(snapshot.oldestPendingAgeMs)}</span>
        </div>
      )}

      {/* Sync cursors */}
      {Object.keys(cursors).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Sync Per Entity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm">
              {Object.entries(cursors).map(([entity, cursor]) => (
                <div key={entity} className="flex justify-between items-center px-4 py-2">
                  <span className="font-mono text-xs text-muted-foreground">{entity}</span>
                  <span className={cursor ? "text-foreground" : "text-muted-foreground italic"}>
                    {formatCursor(cursor)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dead-letter items */}
      {deadLetterItems.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Dead-letter Queue ({deadLetterItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm">
              {deadLetterItems.map((item: any) => {
                const mutationId: string = item._raw?.mutation_id ?? item.id;
                const isActing = actionInProgress === mutationId;
                const entity: string = item._raw?.entity ?? "unknown";
                const operation: string = item._raw?.operation ?? "unknown";
                const reason: string = item._raw?.dead_letter_reason ?? "Unknown error";
                const attempts: number = item._raw?.attempt_count ?? 0;

                return (
                  <div key={mutationId} className="flex justify-between items-start px-4 py-3 gap-4">
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate">{entity}.{operation}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate" title={reason}>
                        {reason}
                      </p>
                      <p className="text-xs text-muted-foreground">{attempts} attempts</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRetry(mutationId)}
                        disabled={isActing}
                        className="gap-1"
                      >
                        {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleDiscard(mutationId)}
                        disabled={isActing}
                        className="gap-1 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                        Discard
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {snapshot && snapshot.pending === 0 && snapshot.failed === 0 && snapshot.deadLetter === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-gray-500" />
          Outbox is clear — all mutations synced
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "ok" | "warning" | "error" | "neutral";
}) {
  const badgeVariant =
    variant === "error"
      ? "destructive"
      : variant === "warning"
      ? "secondary"
      : "outline";

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {variant === "ok" && value === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-gray-500" />
          ) : variant === "error" && value > 0 ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : null}
        </div>
        <p className="text-2xl font-bold mt-1">
          <Badge variant={badgeVariant} className="text-lg px-2 py-0.5">
            {value}
          </Badge>
        </p>
      </CardContent>
    </Card>
  );
}

export default OfflineSyncDashboard;
