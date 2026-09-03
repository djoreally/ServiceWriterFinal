import { useEffect, useMemo, useState } from "react";
import { MailPlus, RefreshCw, ShieldCheck, UserRoundPlus, XCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, nextApi, type InvitationRecord, type WorkspaceMembership } from "@/lib/nextApiClient";
import { useTeamRole } from "@/hooks/useTeamRole";

const ROLE_OPTIONS = [
  ["manager", "Manager"],
  ["service_advisor", "Service advisor"],
  ["dispatcher", "Dispatcher"],
  ["technician", "Technician"],
  ["fleet_manager", "Fleet manager"],
  ["customer", "Customer"],
  ["viewer", "Viewer"],
] as const;

function status(invitation: InvitationRecord): { label: string; tone: string } {
  if (invitation.accepted_at) return { label: "Accepted", tone: "bg-emerald-500/10 text-emerald-700" };
  if (invitation.revoked_at) return { label: "Revoked", tone: "bg-muted text-muted-foreground" };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return { label: "Expired", tone: "bg-amber-500/10 text-amber-700" };
  return { label: "Pending", tone: "bg-primary/10 text-primary" };
}

function lifecycleDetail(invitation: InvitationRecord): string {
  if (invitation.accepted_at) return `Accepted ${new Date(invitation.accepted_at).toLocaleString()}`;
  if (invitation.revoked_at) return `Revoked ${new Date(invitation.revoked_at).toLocaleString()}`;
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return `Expired ${new Date(invitation.expires_at).toLocaleString()}`;
  return `Expires ${new Date(invitation.expires_at).toLocaleString()}`;
}

function deliveryFailureMessage(error?: string): string {
  return error ? `Invitation created, but delivery failed: ${error}` : "Invitation created, but delivery failed.";
}

export default function InvitationCenter() {
  const { role } = useTeamRole();
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitationCreatePayloadRole>("technician");
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void nextApi.workspaces().then((data) => {
      if (!active) return;
      const allowed = data.filter((item) => ["owner", "admin"].includes(item.role));
      setMemberships(allowed);
      setWorkspaceId(allowed[0]?.workspace_id ?? "");
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not load workspaces"));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!workspaceId) { void Promise.resolve().then(() => setInvitations([])); void Promise.resolve().then(() => setLoading(false)); return; }
    void Promise.resolve().then(() => setLoading(true));
    void Promise.resolve().then(() => nextApi.invitations.list(workspaceId).then((response) => setInvitations(response.data)).catch((error) => toast.error(error instanceof Error ? error.message : "Could not load invitations")).finally(() => setLoading(false)));
  }, [workspaceId]);

  const workspaceName = useMemo(() => memberships.find((item) => item.workspace_id === workspaceId)?.workspaces?.name ?? "your workspace", [memberships, workspaceId]);
  const canManage = role === "owner" || role === "admin";

  async function createInvitation(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId || !email.trim()) return;
    if (inviteRole === "customer" && !customerId.trim()) { toast.error("Customer invitations require a customer ID."); return; }
    setSaving(true);
    try {
      const response = await nextApi.invitations.create({ workspace_id: workspaceId, invited_email: email.trim().toLowerCase(), invited_role: inviteRole, customer_id: customerId.trim() || undefined });
      setInvitations((current) => [response.data, ...current]);
      if (response.delivery.status === "accepted") {
        setEmail("");
        setCustomerId("");
        toast.success("Invitation sent.");
      } else {
        toast.error(deliveryFailureMessage(response.delivery.error));
      }
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Could not create invitation");
    } finally { setSaving(false); }
  }

  async function runAction(invitation: InvitationRecord, action: "resend" | "revoke") {
    setBusyId(invitation.id);
    try {
      if (action === "resend") {
        const response = await nextApi.invitations.resend(invitation.id);
        setInvitations((current) => current.map((item) => item.id === invitation.id ? response.data : item));
        if (response.delivery.status === "accepted") toast.success("Invitation resent.");
        else toast.error(response.delivery.error ? `Invitation resend failed: ${response.delivery.error}` : "Invitation resend failed.");
      } else {
        const response = await nextApi.invitations.revoke(invitation.id);
        setInvitations((current) => current.map((item) => item.id === invitation.id ? response.data : item));
        toast.success("Invitation revoked.");
      }
    } catch (error) { toast.error(error instanceof ApiClientError ? error.message : "Invitation action failed"); }
    finally { setBusyId(null); }
  }

  return <AppLayout title="Invitations">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-primary">Access management</p><h1 className="text-2xl font-semibold tracking-tight">Invite people to {workspaceName}</h1><p className="text-sm text-muted-foreground">Send role-scoped access without exposing workspace data across tenants.</p></div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Workspace protected by RLS</div>
      </header>
      {memberships.length > 1 && <div className="max-w-full"><Label htmlFor="workspace-select">Workspace</Label><select id="workspace-select" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-md">{memberships.map((item) => <option key={item.workspace_id} value={item.workspace_id}>{item.workspaces?.name ?? item.workspace_id}</option>)}</select></div>}
      {!canManage && <Card><CardContent className="p-5 text-sm text-muted-foreground">Only workspace owners and administrators can manage invitations.</CardContent></Card>}
      {canManage && <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRoundPlus className="h-5 w-5" /> New invitation</CardTitle><CardDescription>Supabase Auth generates the secure sign-in link and Resend delivers the transactional invitation. Existing signed-in users with the invited email can join without creating another password.</CardDescription></CardHeader><CardContent><form onSubmit={createInvitation} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="invite-email">Email address</Label><Input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></div><div className="space-y-2"><Label htmlFor="invite-role">Role</Label><select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as InvitationCreatePayloadRole)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><Button type="submit" disabled={saving || !workspaceId} className="gap-2"><MailPlus className="h-4 w-4" />{saving ? "Sending…" : "Send invite"}</Button>{inviteRole === "customer" && <div className="sm:col-span-2 space-y-2"><Label htmlFor="customer-id">Customer ID</Label><Input id="customer-id" value={customerId} onChange={(event) => setCustomerId(event.target.value)} placeholder="UUID from the customer record" /></div>}</form></CardContent></Card>}
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Invitation history</h2><span className="text-sm text-muted-foreground">{invitations.length} records</span></div>{loading ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading invitations…</CardContent></Card> : invitations.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No invitations yet. Start by inviting a technician, dispatcher, fleet manager, or customer.</CardContent></Card> : <div className="grid gap-3">{invitations.map((invitation) => { const current = status(invitation); const active = current.label === "Pending"; return <Card key={invitation.id}><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{invitation.invited_email}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${current.tone}`}>{current.label}</span></div><p className="mt-1 text-sm capitalize text-muted-foreground">{invitation.invited_role.replaceAll("_", " ")} · {lifecycleDetail(invitation)}</p>{invitation.accepted_at && invitation.accepted_by && <p className="mt-1 text-xs text-muted-foreground">Accepted user: {invitation.accepted_by}</p>}</div>{active && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={busyId === invitation.id} onClick={() => void runAction(invitation, "resend")} className="gap-2"><RefreshCw className="h-4 w-4" />Resend</Button><Button type="button" size="sm" variant="ghost" disabled={busyId === invitation.id} onClick={() => void runAction(invitation, "revoke")} className="gap-2 text-destructive"><XCircle className="h-4 w-4" />Revoke</Button></div>}</CardContent></Card>; })}</div>}</section>
    </div>
  </AppLayout>;
}

type InvitationCreatePayloadRole = "owner" | "admin" | "manager" | "service_advisor" | "technician" | "dispatcher" | "receptionist" | "fleet_manager" | "viewer" | "customer";
