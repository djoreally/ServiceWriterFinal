import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, X, Send, MoreHorizontal, Loader2 } from "lucide-react";
import {
  snoozeSignal,
  dismissSignal,
  resolveSignal,
  bulkEnqueueAction,
  type RetentionActionType,
} from "@/application/commands/retention-actions.command";
import { fetchSignalsByIds, type GroupedSignal, type SignalRow } from "@/application/queries/retention-impact.query";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// ── Per signal-type action mapping ───────────────────────────
type ActionDef = { label: string; type: RetentionActionType; primary?: boolean };
const SIGNAL_ACTIONS: Record<string, ActionDef[]> = {
  winback_candidate: [
    { label: "Send Winback SMS", type: "send_winback_sms", primary: true },
    { label: "Issue Reward", type: "issue_reward" },
  ],
  customer_winback_candidate: [
    { label: "Send Winback SMS", type: "send_winback_sms", primary: true },
    { label: "Issue Reward", type: "issue_reward" },
  ],
  vehicle_overdue: [
    { label: "Send Reminder", type: "send_reminder", primary: true },
    { label: "Schedule Call", type: "schedule_call" },
  ],
  vehicle_at_risk: [
    { label: "Send Reminder", type: "send_reminder", primary: true },
    { label: "Schedule Call", type: "schedule_call" },
  ],
  at_risk: [
    { label: "Send Reminder", type: "send_reminder", primary: true },
    { label: "Schedule Call", type: "schedule_call" },
  ],
  cancelled_appointment: [
    { label: "Send Recovery Offer", type: "send_recovery_offer", primary: true },
  ],
  customer_cancelled_appointment: [
    { label: "Send Recovery Offer", type: "send_recovery_offer", primary: true },
  ],
  payment_received: [
    { label: "Award Points", type: "award_points", primary: true },
  ],
  customer_payment_received: [
    { label: "Award Points", type: "award_points", primary: true },
  ],
};

function actionsFor(type: string): ActionDef[] {
  return SIGNAL_ACTIONS[type] || [{ label: "Send Reminder", type: "send_reminder", primary: true }];
}

function prettyType(type: string) {
  return type
    .replace(/^customer\./, "")
    .replace(/^customer_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Group Card ───────────────────────────────────────────────
function GroupCard({ group, userId }: { group: GroupedSignal; userId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const actions = actionsFor(group.signal_type);
  const primary = actions.find((a) => a.primary) || actions[0];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["retention-grouped-signals", userId] });
    queryClient.invalidateQueries({ queryKey: ["retention-impact", userId] });
    queryClient.invalidateQueries({ queryKey: ["retention-signal-log", userId] });
  };

  const runBulk = async (actionType: RetentionActionType, label: string) => {
    setBusy(actionType);
    try {
      const { enqueued } = await bulkEnqueueAction({
        userId,
        signalIds: group.signal_ids,
        actionType,
      });
      toast.success(`${label} queued for ${enqueued} signal${enqueued === 1 ? "" : "s"}`);
      invalidate();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const snoozeAll = async () => {
    setBusy("snooze");
    try {
      await Promise.all(group.signal_ids.map((id) => snoozeSignal(id, 30)));
      toast.success(`Snoozed ${group.signal_ids.length} signals for 30 days`);
      invalidate();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const dismissAll = async () => {
    setBusy("dismiss");
    try {
      await Promise.all(group.signal_ids.map((id) => dismissSignal(id)));
      toast.success(`Dismissed ${group.signal_ids.length} signals`);
      invalidate();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-black tabular-nums text-primary">{group.count}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{prettyType(group.signal_type)}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
              <span>avg score {group.avg_score.toFixed(2)}</span>
              {group.estimated_impact > 0 && (
                <span className="font-semibold text-foreground">
                  ~${group.estimated_impact.toLocaleString("en-US", { maximumFractionDigits: 0 })} at stake
                </span>
              )}
              {group.oldest_detected_at && (
                <span>oldest {formatDistanceToNow(new Date(group.oldest_detected_at), { addSuffix: true })}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            size="sm"
            disabled={!!busy}
            onClick={() => runBulk(primary.type, `${primary.label} all (${group.count})`)}
            className="gap-1.5"
          >
            {busy === primary.type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {primary.label} ({group.count})
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {actions.filter((a) => !a.primary).map((a) => (
                <DropdownMenuItem key={a.type} onClick={() => runBulk(a.type, `${a.label} all`)}>
                  <Send className="h-3.5 w-3.5 mr-2" />
                  {a.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={snoozeAll}>
                <Clock className="h-3.5 w-3.5 mr-2" />
                Snooze 30d
              </DropdownMenuItem>
              <DropdownMenuItem onClick={dismissAll} className="text-destructive">
                <X className="h-3.5 w-3.5 mr-2" />
                Dismiss all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs"
          >
            {expanded ? "Hide" : "Expand"}
          </Button>
        </div>
      </div>

      {expanded && (
        <ExpandedRows group={group} userId={userId} onChange={invalidate} />
      )}
    </div>
  );
}

// ── Expanded per-signal rows ─────────────────────────────────
function ExpandedRows({
  group,
  userId,
  onChange,
}: {
  group: GroupedSignal;
  userId: string;
  onChange: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["retention-group-rows", group.signal_type, group.signal_ids.slice(0, 5).join(",")],
    queryFn: () => fetchSignalsByIds(group.signal_ids),
  });

  const actions = actionsFor(group.signal_type);
  const primary = actions.find((a) => a.primary) || actions[0];

  const handleSingleAction = async (signal: SignalRow, actionType: RetentionActionType, label: string) => {
    try {
      await bulkEnqueueAction({ userId, signalIds: [signal.id], actionType });
      toast.success(`${label} queued`);
      onChange();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  const handleSnooze = async (signal: SignalRow) => {
    try {
      await snoozeSignal(signal.id, 30);
      toast.success("Snoozed 30 days");
      onChange();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  const handleDismiss = async (signal: SignalRow) => {
    try {
      await dismissSignal(signal.id);
      toast.success("Dismissed");
      onChange();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  const handleResolve = async (signal: SignalRow) => {
    try {
      await resolveSignal(signal.id);
      toast.success("Resolved");
      onChange();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="border-t border-border/60 bg-muted/20 divide-y divide-border/40 max-h-80 overflow-y-auto">
      {isLoading ? (
        <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading individual signals…
        </div>
      ) : !data?.length ? (
        <div className="p-4 text-xs text-muted-foreground">No detail rows.</div>
      ) : (
        data.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">
                {s.customer?.name || (s.customer_id ? s.customer_id.slice(0, 8) : "Unknown")}
                {s.customer?.email && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{s.customer.email}</span>
                )}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                {s.score !== null && <span>score {Number(s.score).toFixed(2)}</span>}
                <span>{formatDistanceToNow(new Date(s.detected_at), { addSuffix: true })}</span>
                {s.customer?.lifetime_value !== null && s.customer?.lifetime_value !== undefined && (
                  <span>LTV ${Number(s.customer.lifetime_value).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleSingleAction(s, primary.type, primary.label)}>
                {primary.label}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {actions.filter((a) => !a.primary).map((a) => (
                    <DropdownMenuItem key={a.type} onClick={() => handleSingleAction(s, a.type, a.label)}>
                      {a.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={() => handleSnooze(s)}>
                    <Clock className="h-3.5 w-3.5 mr-2" /> Snooze 30d
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleResolve(s)}>
                    Mark resolved
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDismiss(s)} className="text-destructive">
                    <X className="h-3.5 w-3.5 mr-2" /> Dismiss
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main Action Queue ────────────────────────────────────────
export function ActionQueue({
  userId,
  groups,
  isLoading,
}: {
  userId: string;
  groups: GroupedSignal[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/60 bg-card p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading action queue…
      </div>
    );
  }

  if (!groups?.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-card p-12 text-center">
        <Badge variant="outline" className="mb-3">All clear</Badge>
        <p className="text-sm font-medium">No actionable signals right now.</p>
        <p className="text-xs text-muted-foreground mt-1">
          New signals appear here as customers, vehicles, and payments trigger retention rules.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <GroupCard key={g.signal_type} group={g} userId={userId} />
      ))}
    </div>
  );
}
