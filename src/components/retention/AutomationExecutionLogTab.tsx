/**
 * AutomationExecutionLogTab — recent rule runs with status, retry, and dry-run preview.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  RefreshCw,
} from "lucide-react";
import {
  fetchAutomationExecutions,
  type AutomationExecutionRow,
} from "@/application/queries/automation-executions.query";

const statusColor: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  pending: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  scheduled: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  failed: "bg-red-500/10 text-red-600 border-red-500/20",
  skipped: "bg-muted text-muted-foreground border-border",
};

interface AutomationExecutionLogTabProps {
  userId: string;
}

export function AutomationExecutionLogTab({ userId }: AutomationExecutionLogTabProps) {
  const [selected, setSelected] = useState<AutomationExecutionRow | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["automation-executions", userId],
    queryFn: () => fetchAutomationExecutions(userId, 100),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const counts = (data || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-black">{counts.completed || 0}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-black">{(counts.pending || 0) + (counts.scheduled || 0)}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-black">{counts.failed || 0}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-black">{data?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Total Runs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base font-black tracking-tight">Execution Log</CardTitle>
            <CardDescription>
              Recent automation rule runs — newest first, refreshes every 15 seconds
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading executions...
            </div>
          ) : !data?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Activity className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No automation runs yet</p>
              <p className="text-xs mt-1">
                Rules execute when matching signals are detected.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[480px]">
              <div className="space-y-2">
                {data.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">
                            {row.rule_name || "Unnamed rule"}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {row.action_type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.customer_name && <>👤 {row.customer_name} · </>}
                          {row.executed_at
                            ? `${formatDistanceToNow(new Date(row.executed_at), { addSuffix: true })} · ${format(new Date(row.executed_at), "MMM d, h:mm a")}`
                            : "Not yet executed"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className={statusColor[row.status] || statusColor.pending}
                      >
                        {row.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSelected(row)}
                        title="View payload"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Execution detail</DialogTitle>
            <DialogDescription>
              {selected?.rule_name || "Unnamed rule"} ·{" "}
              <span className="font-mono">{selected?.action_type}</span>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs bg-muted/50 p-3 rounded font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(selected?.result_jsonb || {}, null, 2)}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
