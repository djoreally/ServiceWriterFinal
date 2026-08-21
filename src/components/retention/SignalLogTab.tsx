import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, AlertTriangle, CheckCircle2, Signal as SignalIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fetchSignalLog } from "@/application/queries/retention-impact.query";

const STATUS_COLOR: Record<string, string> = {
  detected: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  active: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  suppressed: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

export function SignalLogTab({ userId }: { userId: string }) {
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("");
  const [scoreMin, setScoreMin] = useState<string>("");

  const filters = useMemo(
    () => ({
      status: status === "all" ? undefined : status,
      type: type || undefined,
      scoreMin: scoreMin ? Number(scoreMin) : undefined,
      limit: 200,
    }),
    [status, type, scoreMin],
  );

  const { data: signals, isLoading } = useQuery({
    queryKey: ["retention-signal-log", userId, filters],
    queryFn: () => fetchSignalLog(userId, filters),
  });

  // Build distinct signal types from current dataset for filter dropdown
  const allTypes = useMemo(() => {
    const set = new Set<string>();
    signals?.forEach((s) => set.add(s.signal_type));
    return Array.from(set).sort();
  }, [signals]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-black tracking-tight">Signal Log</CardTitle>
        <CardDescription>Raw chronological feed of every retention signal · power-user view</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="detected">Detected</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type || "_all_"} onValueChange={(v) => setType(v === "_all_" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all_">All types</SelectItem>
              {allTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.1}
            placeholder="Min score (0–1)"
            value={scoreMin}
            onChange={(e) => setScoreMin(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Loading log…</div>
        ) : !signals?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <SignalIcon className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No signals match these filters.</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-2">
            <div className="space-y-1">
              {signals.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2.5 rounded border border-border/40 bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      {s.signal_type?.includes("overdue") || s.signal_type?.includes("risk") ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      ) : s.signal_type?.includes("completed") || s.signal_type?.includes("payment") ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Activity className="h-3.5 w-3.5 text-blue-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.signal_type}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(s.detected_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.score !== null && (
                      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                        {Number(s.score).toFixed(2)}
                      </span>
                    )}
                    <Badge variant="outline" className={STATUS_COLOR[s.status] || ""}>{s.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
