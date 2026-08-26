import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRetentionVehicleProfiles,
  fetchLoyaltyPrograms,
  fetchLoyaltyRewards,
  fetchLoyaltyAccountStats,
  fetchAutomationRules,
  fetchJobQueueStats,
  fetchJobQueueHealth,
} from "@/application/queries/retention.query";
import { fetchGroupedActionableSignals } from "@/application/queries/retention-impact.query";
import {
  deleteLoyaltyProgram,
  deleteLoyaltyReward,
  toggleAutomationRule,
  deleteAutomationRule,
} from "@/application/commands/retention.command";
import { useAuth } from "@packages/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import {
  Signal, Zap, Gift, Bot, Activity, AlertTriangle, CheckCircle2, Clock,
  TrendingUp, Users, Car, RefreshCw, Plus, Pencil, Trash2, Trophy, BarChart3,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { AutomationRuleDialog } from "@/components/retention/AutomationRuleDialog";
import { LoyaltyProgramDialog } from "@/components/retention/LoyaltyProgramDialog";
import { LoyaltyRewardDialog } from "@/components/retention/LoyaltyRewardDialog";
import { RetentionHeroStrip } from "@/components/retention/RetentionHeroStrip";
import { ActionQueue } from "@/components/retention/ActionQueue";
import { SignalLogTab } from "@/components/retention/SignalLogTab";
import { LoyaltyTemplateGallery } from "@/components/retention/LoyaltyTemplateGallery";
import { AutomationTemplateGallery } from "@/components/retention/AutomationTemplateGallery";
import { CustomerSegmentation } from "@/components/marketing/CustomerSegmentation";
import { AutomationExecutionLogTab } from "@/components/retention/AutomationExecutionLogTab";
import { dryRunAutomationRule } from "@/application/commands/automation-template.command";
import { AUTOMATION_TEMPLATES } from "@/lib/retention/automation-templates";
import { useRetentionRealtime } from "@/lib/retention/use-retention-realtime";
import { RetentionAnalyticsTab } from "@/components/retention/RetentionAnalyticsTab";

// ── Status badge colors ─────────────────────────────────────
const signalStatusColor: Record<string, string> = {
  detected: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  active: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  suppressed: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

const seededAutomationRuleNames = new Set(AUTOMATION_TEMPLATES.map((template) => template.name));

const lifecycleColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  due_soon: "bg-amber-500/10 text-amber-600",
  overdue: "bg-orange-500/10 text-orange-600",
  at_risk: "bg-red-500/10 text-red-600",
  lost: "bg-muted text-muted-foreground",
};

// SignalsTab removed — replaced by Overview (hero + action queue) and Signal Log tab.

// ── Vehicle Profiles Tab ────────────────────────────────────
function VehicleProfilesTab({ userId }: { userId: string }) {
  const { data: profiles, isLoading } = useQuery({
    queryKey: ["retention-vehicle-profiles", userId],
    queryFn: () => fetchRetentionVehicleProfiles(userId),
  });

  const statusCounts = profiles?.reduce((acc, p) => {
    const s = (p.lifecycle_status as string) || "unknown";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {["active", "due_soon", "overdue", "at_risk", "lost"].map((status) => (
          <Card key={status}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black">{statusCounts[status] || 0}</p>
              <Badge variant="outline" className={`mt-1 ${lifecycleColors[status] || ""}`}>
                {status.replace("_", " ")}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-black tracking-tight">Vehicle Lifecycle Profiles</CardTitle>
          <CardDescription>Predictive service scheduling per vehicle</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Loading profiles...</div>
          ) : !profiles?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Car className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No vehicle profiles yet</p>
              <p className="text-xs mt-1">Profiles are created as services are completed</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {profiles.map((p) => (
                  <div key={p.vehicle_id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-semibold font-mono">{(p.vehicle_id as string).slice(0, 8)}…</p>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {p.last_service_date && <span>Last: {format(new Date(p.last_service_date as string), "MMM d, yyyy")}</span>}
                          {p.avg_days_between_services && <span>Avg: {p.avg_days_between_services}d</span>}
                          {p.predicted_next_service_date && <span>Next: {format(new Date(p.predicted_next_service_date as string), "MMM d")}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(p.days_overdue as number) > 0 && (
                        <span className="text-xs font-semibold text-red-500">{p.days_overdue}d overdue</span>
                      )}
                      <Badge variant="outline" className={lifecycleColors[(p.lifecycle_status as string)] || ""}>
                        {(p.lifecycle_status as string)?.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Loyalty Tab ─────────────────────────────────────────────
function LoyaltyTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [showProgramDialog, setShowProgramDialog] = useState(false);
  const [editProgram, setEditProgram] = useState<Record<string, unknown> | null>(null);
  const [showRewardDialog, setShowRewardDialog] = useState(false);
  const [editReward, setEditReward] = useState<Record<string, unknown> | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const { data: programs, isLoading } = useQuery({
    queryKey: ["loyalty-programs", userId],
    queryFn: () => fetchLoyaltyPrograms(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: rewards } = useQuery({
    queryKey: ["loyalty-rewards", userId],
    queryFn: () => fetchLoyaltyRewards(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: accountStats } = useQuery({
    queryKey: ["loyalty-account-stats", userId],
    queryFn: () => fetchLoyaltyAccountStats(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["loyalty-programs", userId] });
    queryClient.invalidateQueries({ queryKey: ["loyalty-rewards", userId] });
    queryClient.invalidateQueries({ queryKey: ["loyalty-account-stats", userId] });
  }, [queryClient, userId]);

  const programNames = useMemo(() => programs?.map((p) => p.name) || [], [programs]);
  const hasPrograms = (programs?.length || 0) > 0;

  const handleDeleteProgram = async (id: string) => {
    if (!confirm("Delete this loyalty program and all its rewards?")) return;
    try {
      await deleteLoyaltyProgram(id);
      toast.success("Program deleted"); invalidate();
    } catch { toast.error("Failed to delete program"); }
  };

  const handleDeleteReward = async (id: string) => {
    if (!confirm("Delete this reward?")) return;
    try {
      await deleteLoyaltyReward(id);
      toast.success("Reward deleted"); invalidate();
    } catch { toast.error("Failed to delete reward"); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10"><Gift className="h-4 w-4 text-violet-500" /></div>
          <div><p className="text-2xl font-black">{programs?.length || 0}</p><p className="text-xs text-muted-foreground">Programs</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10"><Users className="h-4 w-4 text-emerald-500" /></div>
          <div><p className="text-2xl font-black">{accountStats?.active || 0}</p><p className="text-xs text-muted-foreground">Active Members</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10"><TrendingUp className="h-4 w-4 text-amber-500" /></div>
          <div><p className="text-2xl font-black">{(accountStats?.totalPoints || 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Points in Circulation</p></div>
        </CardContent></Card>
      </div>

      {/* Quick-start templates: full gallery when empty, collapsed otherwise */}
      <Card>
        <CardContent className="p-4">
          <LoyaltyTemplateGallery
            userId={userId}
            existingProgramNames={programNames}
            collapsed={hasPrograms}
            onSeeded={invalidate}
          />
        </CardContent>
      </Card>

      {/* Programs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base font-black tracking-tight">Loyalty Programs</CardTitle>
            <CardDescription>Points, tiers, and reward configurations</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditProgram(null); setShowProgramDialog(true); }} className="gap-1">
            <Plus className="h-4 w-4" /> New Program
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Loading programs...</div>
          ) : !programs?.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Gift className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No loyalty programs yet</p>
              <p className="text-xs mt-1">Pick a template above to launch in one click — or build from scratch.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => { setEditProgram(null); setShowProgramDialog(true); }}>
                <Plus className="h-4 w-4" /> Custom program
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {programs.map((prog) => {
                const progRewards = rewards?.filter(r => r.program_id === prog.id) || [];
                return (
                  <div key={prog.id} className="p-4 rounded-lg border bg-card space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{prog.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Scope: {prog.scope} · Created {prog.created_at ? formatDistanceToNow(new Date(prog.created_at), { addSuffix: true }) : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={prog.status === "active" ? "default" : "secondary"}>{prog.status}</Badge>
                        <Button variant="ghost" size="icon" onClick={() => { setEditProgram(prog); setShowProgramDialog(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteProgram(prog.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Rewards for this program */}
                    <div className="pl-4 border-l-2 border-muted space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rewards</p>
                        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => { setSelectedProgramId(prog.id); setEditReward(null); setShowRewardDialog(true); }}>
                          <Plus className="h-3 w-3" /> Add Reward
                        </Button>
                      </div>
                      {progRewards.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No rewards configured</p>
                      ) : (
                        progRewards.map((reward) => (
                          <div key={reward.id} className="flex items-center justify-between p-2 rounded border bg-muted/20">
                            <div className="flex items-center gap-2">
                              <Trophy className="h-3.5 w-3.5 text-amber-500" />
                              <div>
                                <p className="text-sm font-medium">{reward.name}</p>
                                <p className="text-xs text-muted-foreground">{reward.points_required} pts · {reward.reward_type.replace("_", " ")}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedProgramId(prog.id); setEditReward(reward); setShowRewardDialog(true); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteReward(reward.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <LoyaltyProgramDialog
        open={showProgramDialog}
        onOpenChange={setShowProgramDialog}
        userId={userId}
        editProgram={editProgram as any}
        onSaved={invalidate}
      />
      {selectedProgramId && (
        <LoyaltyRewardDialog
          open={showRewardDialog}
          onOpenChange={setShowRewardDialog}
          userId={userId}
          programId={selectedProgramId}
          editReward={editReward as any}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

// ── Automation Rules Tab ────────────────────────────────────
function AutomationTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editRule, setEditRule] = useState<Record<string, unknown> | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["automation-rules", userId],
    queryFn: () => fetchAutomationRules(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: jobs } = useQuery({
    queryKey: ["job-queue-recent", userId],
    queryFn: () => fetchJobQueueStats(userId),
    staleTime: 30_000,
  });

  const jobStats = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs?.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
    return counts;
  }, [jobs]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["automation-rules", userId] });
  }, [queryClient, userId]);

  const ruleNames = useMemo(() => rules?.map((r) => r.name) || [], [rules]);
  const hasRules = (rules?.length || 0) > 0;

  const handleToggleRule = async (ruleId: string, currentActive: boolean) => {
    try {
      await toggleAutomationRule(ruleId, currentActive);
      toast.success(`Rule ${currentActive ? "disabled" : "enabled"}`); invalidate();
    } catch { toast.error("Failed to toggle rule"); }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Delete this automation rule?")) return;
    try {
      await deleteAutomationRule(ruleId);
      toast.success("Rule deleted"); invalidate();
    } catch { toast.error("Failed to delete rule"); }
  };

  const handleTestRule = async (ruleId: string, ruleName: string) => {
    try {
      const result = await dryRunAutomationRule(userId, ruleId);
      const summary = result.actionResults
        .map((a: { type: string; preview: { subject?: string; body?: string; config?: unknown } }, i: number) =>
          `${i + 1}. ${a.type}: ${a.preview.subject || a.preview.body || JSON.stringify(a.preview.config) || "(no preview)"}`)
        .join("\n\n");
      toast.success(`${ruleName} dry-run`, {
        description: summary.slice(0, 300) + (summary.length > 300 ? "..." : ""),
        duration: 8000,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Bot className="h-4 w-4 text-primary" /></div>
          <div><p className="text-2xl font-black">{rules?.filter((r) => r.is_active).length || 0}</p><p className="text-xs text-muted-foreground">Active Rules</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10"><Clock className="h-4 w-4 text-amber-500" /></div>
          <div><p className="text-2xl font-black">{jobStats?.pending || 0}</p><p className="text-xs text-muted-foreground">Pending Jobs</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
          <div><p className="text-2xl font-black">{jobStats?.completed || 0}</p><p className="text-xs text-muted-foreground">Completed</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="h-4 w-4 text-red-500" /></div>
          <div><p className="text-2xl font-black">{(jobStats?.failed || 0) + (jobStats?.dead_letter || 0)}</p><p className="text-xs text-muted-foreground">Failed</p></div>
        </CardContent></Card>
      </div>

      {/* Quick-start automation templates */}
      <Card>
        <CardContent className="p-4">
          <AutomationTemplateGallery
            userId={userId}
            existingRuleNames={ruleNames}
            collapsed={hasRules}
            onSeeded={invalidate}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base font-black tracking-tight">Automation Rules</CardTitle>
            <CardDescription>Event-driven rules that trigger actions automatically</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditRule(null); setShowRuleDialog(true); }} className="gap-1">
            <Plus className="h-4 w-4" /> New Rule
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Loading rules...</div>
          ) : !rules?.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bot className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No rules yet</p>
              <p className="text-xs mt-1">Pick a template above — or build a custom rule from scratch.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => { setEditRule(null); setShowRuleDialog(true); }}>
                <Plus className="h-4 w-4" /> Custom rule
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => {
                const trigger = rule.trigger_jsonb as Record<string, unknown> | null;
                const actions = rule.actions_jsonb as Array<Record<string, unknown>> | null;
                return (
                  <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold flex items-center gap-2">
                          {rule.name}
                          {seededAutomationRuleNames.has(rule.name) && (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                              Pre-configured
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Trigger: {(trigger?.type as string) || "—"} · {actions?.length || 0} action(s) · Priority {rule.priority}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => handleToggleRule(rule.id, rule.is_active)}
                      />
                      <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => handleTestRule(rule.id, rule.name)}>
                        <Activity className="h-3.5 w-3.5" /> Test
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditRule(rule); setShowRuleDialog(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(rule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AutomationRuleDialog
        open={showRuleDialog}
        onOpenChange={setShowRuleDialog}
        userId={userId}
        editRule={editRule as any}
        onSaved={invalidate}
      />
    </div>
  );
}

// ── Segments Tab ──────────────────────────────────────────
function SegmentsTab() {
  return <CustomerSegmentation />;
}

// ── Overview Tab (hero + action queue) ──────────────────────
function OverviewTab({ userId }: { userId: string }) {
  const { data: groups, isLoading } = useQuery({
    queryKey: ["retention-grouped-signals", userId],
    queryFn: () => fetchGroupedActionableSignals(userId),
  });

  return (
    <div className="space-y-6">
      <RetentionHeroStrip userId={userId} />
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-black tracking-tight">Action Queue</h2>
            <p className="text-xs text-muted-foreground">
              Top opportunities, grouped and prioritized by impact
            </p>
          </div>
          {groups && groups.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <Activity className="h-3 w-3" />
              {groups.reduce((sum, g) => sum + g.count, 0)} signals
            </Badge>
          )}
        </div>
        <ActionQueue userId={userId} groups={groups} isLoading={isLoading} />
      </div>
    </div>
  );
}

// ── Header status badge & Run Sweep ─────────────────────────
function RetentionHeaderActions({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [sweeping, setSweeping] = useState(false);

  const { data: health } = useQuery({
    queryKey: ["job-queue-health", userId],
    queryFn: () => fetchJobQueueHealth(userId),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const runSweep = useCallback(async () => {
    setSweeping(true);
    const keys = [
      "retention-grouped-signals", "retention-signals", "retention-impact-stats",
      "retention-vehicle-profiles", "loyalty-programs", "loyalty-rewards",
      "loyalty-account-stats", "automation-rules", "job-queue-recent", "job-queue-health",
    ];
    await Promise.all(
      keys.map((k) => queryClient.invalidateQueries({ queryKey: [k, userId] })),
    );
    toast.success("Refreshed all retention data");
    setTimeout(() => setSweeping(false), 600);
  }, [queryClient, userId]);

  let badgeLabel = "Idle";
  let badgeClass = "text-muted-foreground border-border";
  let dotClass = "bg-muted-foreground/40";
  if (health) {
    if (health.running > 0) {
      badgeLabel = `Running (${health.running})`;
      badgeClass = "text-emerald-600 border-emerald-500/30";
      dotClass = "bg-emerald-500 animate-pulse";
    } else if (health.pending > 0) {
      badgeLabel = `Backlog (${health.pending})`;
      badgeClass = "text-amber-600 border-amber-500/30";
      dotClass = "bg-amber-500";
    } else if (health.failed > 0) {
      badgeLabel = `${health.failed} failed`;
      badgeClass = "text-red-600 border-red-500/30";
      dotClass = "bg-red-500";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={`gap-1.5 ${badgeClass}`}>
        <span className={`h-2 w-2 rounded-md ${dotClass}`} />
        {badgeLabel}
      </Badge>
      <Button size="sm" variant="outline" onClick={runSweep} disabled={sweeping} className="gap-1.5">
        <RefreshCw className={`h-3.5 w-3.5 ${sweeping ? "animate-spin" : ""}`} />
        Run Sweep
      </Button>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function RetentionEngine() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [activeTab, setActiveTab] = useState("overview");

  // Wire realtime channels for the current user (no-op when userId is undefined)
  useRetentionRealtime(userId);

  if (!userId) return null;

  return (
    <AppLayout title="Retention Engine">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Retention Command Center</h1>
            <p className="text-sm text-muted-foreground">
              Facts → Signals → Actions · Automated customer retention & loyalty
            </p>
          </div>
          <RetentionHeaderActions userId={userId} />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="overview" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-1.5">
              <Car className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Vehicles</span>
            </TabsTrigger>
            <TabsTrigger value="loyalty" className="gap-1.5">
              <Gift className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Loyalty</span>
            </TabsTrigger>
            <TabsTrigger value="automation" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Automation</span>
            </TabsTrigger>
            <TabsTrigger value="segments" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Segments</span>
            </TabsTrigger>
            <TabsTrigger value="executions" className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Executions</span>
            </TabsTrigger>
            <TabsTrigger value="log" className="gap-1.5">
              <Signal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Signal Log</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab userId={userId} /></TabsContent>
          <TabsContent value="analytics"><RetentionAnalyticsTab userId={userId} /></TabsContent>
          <TabsContent value="vehicles"><VehicleProfilesTab userId={userId} /></TabsContent>
          <TabsContent value="loyalty"><LoyaltyTab userId={userId} /></TabsContent>
          <TabsContent value="automation"><AutomationTab userId={userId} /></TabsContent>
          <TabsContent value="segments"><SegmentsTab /></TabsContent>
          <TabsContent value="executions"><AutomationExecutionLogTab userId={userId} /></TabsContent>
          <TabsContent value="log"><SignalLogTab userId={userId} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
