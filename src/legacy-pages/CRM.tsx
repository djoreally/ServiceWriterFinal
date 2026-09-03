import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Megaphone, UsersRound } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useWorkspaceSelection } from "@/hooks/useWorkspaceSelection";
import { ApiClientError, nextApi } from "@/lib/nextApiClient";

interface CrmProfile {
  id: string;
  lifecycle_stage: string;
  lead_source: string | null;
  next_action_at: string | null;
  customers?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
}

interface CrmCampaign {
  id: string;
  name: string;
  channel: string;
  approval_state: string;
}

interface CrmActivity {
  id: string;
  activity_type: string;
  summary: string;
  occurred_at: string;
}

async function fetchAllProfiles(workspaceId: string): Promise<CrmProfile[]> {
  const pageSize = 100;
  const all: CrmProfile[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const response = await nextApi.crm.profiles.list(workspaceId, { limit: pageSize, offset });
    const rows = response.data as CrmProfile[];
    all.push(...rows);
    total = response.meta.total;
    if (rows.length === 0) break;
    offset += rows.length;
  }

  return all;
}

function followUpLabel(profile: CrmProfile): string {
  if (profile.lifecycle_stage === "at_risk" || profile.lifecycle_stage === "due") return "Needs attention";
  if (!profile.next_action_at) return "No follow-up scheduled";
  return Date.parse(profile.next_action_at) <= Date.now() ? "Needs attention" : "Follow-up scheduled";
}

export default function CRM() {
  const { selectedWorkspace, selectedWorkspaceId, loading: workspaceLoading } = useWorkspaceSelection();
  const [profiles, setProfiles] = useState<CrmProfile[]>([]);
  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!selectedWorkspaceId) {
        setProfiles([]);
        setCampaigns([]);
        setActivities([]);
        setDenied(false);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setDenied(false);
      setError(null);
      try {
        await nextApi.crm.access(selectedWorkspaceId);
        const [allProfiles, campaignResponse, activityResponse] = await Promise.all([
          fetchAllProfiles(selectedWorkspaceId),
          nextApi.crm.campaigns.list(selectedWorkspaceId),
          nextApi.crm.activities.list(selectedWorkspaceId),
        ]);
        if (!active) return;
        setProfiles(allProfiles);
        setCampaigns(campaignResponse.data as CrmCampaign[]);
        setActivities(activityResponse.data.slice(0, 6) as CrmActivity[]);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiClientError && (cause.status === 403 || cause.code === "crm_forbidden")) {
          setDenied(true);
        } else {
          setError(cause instanceof Error ? cause.message : "CRM data could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [selectedWorkspaceId]);

  const stageCounts = useMemo(() => profiles.reduce<Record<string, number>>((counts, profile) => {
    counts[profile.lifecycle_stage] = (counts[profile.lifecycle_stage] ?? 0) + 1;
    return counts;
  }, {}), [profiles]);

  const customerName = (profile: CrmProfile) => {
    const name = [profile.customers?.first_name, profile.customers?.last_name].filter(Boolean).join(" ");
    return name || profile.customers?.email || "Customer profile";
  };

  return (
    <AppLayout title="CRM Dashboard">
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Customer relationships</p>
            <h1 className="text-2xl font-bold tracking-tight">CRM Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Marketing, loyalty, and customer follow-up stay separate from the daily Operations workspace.
            </p>
          </div>
          {selectedWorkspace && <div className="rounded-lg border bg-card px-3 py-2 text-left text-xs text-muted-foreground">Workspace<strong className="mt-0.5 block text-sm text-foreground">{selectedWorkspace.workspaces?.name}</strong></div>}
        </header>

        {workspaceLoading ? (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" role="status">Loading available workspaces…</div>
        ) : !selectedWorkspaceId ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
            <h2 className="font-semibold">Select a workspace to open CRM</h2>
            <p className="mt-1 text-sm text-muted-foreground">CRM data is isolated by workspace. Use the workspace selector in the header, then return here to load that workspace’s customer relationship data.</p>
            <Link className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary" to="/dashboard">Open Operations workspace selector <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : loading ? (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" role="status">Loading CRM workspace…</div>
        ) : denied ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <h2 className="font-semibold">CRM access is not enabled for this workspace</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ask a workspace owner or platform administrator to grant the CRM capability. Technicians cannot access marketing tools.</p>
            <Link className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary" to="/dashboard">Return to Operations <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">{error}</div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3" aria-label="CRM summary">
              <SummaryCard icon={UsersRound} label="CRM profiles" value={String(profiles.length)} detail={`${stageCounts.active ?? 0} active · ${stageCounts.at_risk ?? 0} at risk`} />
              <SummaryCard icon={Activity} label="Recent activities" value={String(activities.length)} detail="Customer timeline events" />
              <SummaryCard icon={Megaphone} label="Campaigns" value={String(campaigns.length)} detail={`${campaigns.filter((campaign) => campaign.approval_state === "draft").length} drafts awaiting review`} />
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Customer follow-up queue</h2><p className="text-xs text-muted-foreground">All canonical customers projected into CRM; attention reflects due or at-risk follow-up only.</p></div><Link className="text-sm font-semibold text-primary" to="/customers">Operations customers</Link></div>
                <div className="divide-y">{profiles.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No CRM profiles have been created yet.</p> : profiles.map((profile) => <div className="flex min-w-0 items-center justify-between gap-3 p-4" key={profile.id}><div className="min-w-0"><p className="truncate text-sm font-semibold">{customerName(profile)}</p><p className="mt-1 text-xs text-muted-foreground">{profile.lifecycle_stage} · {profile.lead_source || "Source not recorded"}</p></div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-medium">{followUpLabel(profile)}</span></div>)}</div>
              </section>

              <section className="rounded-xl border bg-card">
                <div className="border-b p-4"><h2 className="font-semibold">Recent activity</h2><p className="text-xs text-muted-foreground">CRM timeline only; operational notifications remain in Operations.</p></div>
                <div className="divide-y">{activities.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No activity has been recorded yet.</p> : activities.map((activity) => <div className="p-4" key={activity.id}><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wide text-primary">{activity.activity_type.replaceAll("_", " ")}</span><time className="text-xs text-muted-foreground">{new Date(activity.occurred_at).toLocaleDateString()}</time></div><p className="mt-2 text-sm">{activity.summary}</p></div>)}</div>
              </section>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: typeof UsersRound; label: string; value: string; detail: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
