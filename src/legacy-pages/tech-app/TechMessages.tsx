/** Technician job messaging: one explicit, job-scoped internal/external channel. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Send, Loader2, ShieldCheck, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendJobThreadHumanMessage } from "@/application/commands/job-thread.command";
import { fetchTechJobsByFilter, fetchTechNotificationSettingsForCurrentUser } from "@/application/queries/tech-app.query";
import {
  ensureJobThread, fetchJobThreadTimeline, markJobThreadRead, subscribeJobThreadTimeline,
  type JobSource, type JobThreadTimelineItem,
} from "@/application/queries/job-thread.query";
import { useTechContext } from "./TechAppLayout";
import { DEFAULT_TECH_NOTIFICATION_PREFERENCES, isTechMessageChannelEnabled, type TechnicianNotificationPreferences } from "@/lib/technician-notification-preferences";

type Channel = "dispatch" | "customer_sms" | "customer_email";
type MessageJob = {
  id: string; title: string; scheduled_date: string; scheduled_time: string | null;
  is_fleet?: boolean; customers?: { name: string; phone: string | null } | null;
};

const QUICK_MESSAGES = ["I'm on the way.", "I've arrived.", "I need access to begin service.", "I found an issue. Please review."];

export default function TechMessages() {
  const { identity } = useTechContext();
  const [jobs, setJobs] = useState<MessageJob[]>([]);
  const [jobId, setJobId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [timeline, setTimeline] = useState<JobThreadTimelineItem[]>([]);
  const [channel, setChannel] = useState<Channel>("dispatch");
  const [recipient, setRecipient] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [preferences, setPreferences] = useState<TechnicianNotificationPreferences>(DEFAULT_TECH_NOTIFICATION_PREFERENCES);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === jobId), [jobs, jobId]);
  const source: JobSource = selectedJob?.is_fleet ? "fleet_work_order" : "appointment";

  const loadJobs = useCallback(async () => {
    if (!identity) return;
    try {
      const [today, upcoming, active, prefs] = await Promise.all([
        fetchTechJobsByFilter(identity, "today"), fetchTechJobsByFilter(identity, "upcoming"),
        fetchTechJobsByFilter(identity, "in_progress"), fetchTechNotificationSettingsForCurrentUser(),
      ]);
      setPreferences(prefs);
      const unique = new Map<string, MessageJob>();
      [...today, ...upcoming, ...active].forEach((job) => unique.set(String(job.id), job as unknown as MessageJob));
      const rows = [...unique.values()];
      setJobs(rows);
      setJobId((current) => rows.some((job) => job.id === current) ? current : rows[0]?.id ?? "");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Jobs could not be loaded"); }
    finally { setLoading(false); }
  }, [identity]);

  const loadTimeline = useCallback(async () => {
    if (!selectedJob) { setTimeline([]); setThreadId(""); return; }
    try {
      const id = await ensureJobThread(selectedJob.id, source);
      const items = await fetchJobThreadTimeline(selectedJob.id, source);
      setThreadId(id); setTimeline(items);
      await markJobThreadRead(id);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Conversation could not be loaded"); }
  }, [selectedJob, source]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);
  useEffect(() => { void loadTimeline(); }, [loadTimeline]);
  useEffect(() => threadId ? subscribeJobThreadTimeline(threadId, () => { void loadTimeline(); }) : undefined, [threadId, loadTimeline]);
  useEffect(() => {
    if (channel === "customer_sms") setRecipient(selectedJob?.customers?.phone ?? "");
    else if (channel === "dispatch") setRecipient("");
  }, [channel, selectedJob]);

  const send = async (preset?: string) => {
    const body = (preset ?? content).trim();
    if (!selectedJob || !body) return;
    if (!isTechMessageChannelEnabled(preferences, channel)) { toast.error("This technician channel is disabled in Settings"); return; }
    if (channel !== "dispatch" && !recipient.trim()) { toast.error("Confirm the external recipient before sending"); return; }
    setSending(true);
    const clientMessageId = crypto.randomUUID();
    const { error } = await sendJobThreadHumanMessage({
      jobId: selectedJob.id, jobSource: source, content: body, senderRole: "technician",
      channel, recipient: channel === "dispatch" ? undefined : recipient.trim(), clientMessageId,
    });
    setSending(false);
    if (error) { toast.error(error); return; }
    setContent("");
    toast.success(channel === "dispatch" ? "Sent to workspace dispatch" : "External message queued for delivery");
    await loadTimeline();
  };

  if (loading) return <div className="p-4 space-y-3"><Skeleton className="h-12"/><Skeleton className="h-48"/><Skeleton className="h-24"/></div>;

  return <div className="flex flex-col min-h-full">
    <div className="sticky top-0 z-10 border-b bg-background p-4 flex items-center justify-between">
      <div><h1 className="text-xl font-bold">Job Messages</h1><p className="text-xs text-muted-foreground">Dispatch, customer, and system communication tied to work</p></div>
      <Button variant="ghost" size="icon" onClick={() => void loadTimeline()}><RefreshCw className="h-5 w-5"/></Button>
    </div>
    <div className="p-4 space-y-3 border-b bg-muted/20">
      <Select value={jobId} onValueChange={setJobId}><SelectTrigger><SelectValue placeholder="Select a job"/></SelectTrigger>
        <SelectContent>{jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title} · {job.scheduled_date}</SelectItem>)}</SelectContent>
      </Select>
      {jobs.length === 0 && <p className="text-sm text-muted-foreground">No assigned current or upcoming jobs are available.</p>}
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" variant={channel === "dispatch" ? "default" : "outline"} onClick={() => setChannel("dispatch")}>Dispatch</Button>
        <Button size="sm" variant={channel === "customer_sms" ? "default" : "outline"} disabled={!preferences.customerSmsEnabled} onClick={() => setChannel("customer_sms")}>Customer SMS</Button>
        <Button size="sm" variant={channel === "customer_email" ? "default" : "outline"} disabled={!preferences.customerEmailEnabled} onClick={() => setChannel("customer_email")}>Customer email</Button>
      </div>
      <div className="rounded-md border bg-background p-3 text-xs flex gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary"/>
        {channel === "dispatch" ? "Internal workspace channel. Nothing is sent to the customer." : "External channel selected. Confirm the recipient; delivery is queued and tracked. Disabled channels can be enabled in Settings."}
      </div>
      {channel !== "dispatch" && <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={channel === "customer_sms" ? "Customer mobile number" : "Customer email address"}/>}
      <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write a job-context message…"/>
      <Button className="w-full" disabled={sending || !selectedJob || !content.trim()} onClick={() => void send()}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}Send via {channel === "dispatch" ? "Dispatch" : channel === "customer_sms" ? "SMS" : "email"}</Button>
      {channel === "dispatch" && <div className="flex gap-2 overflow-x-auto">{QUICK_MESSAGES.map((text) => <Button key={text} size="sm" variant="outline" className="shrink-0" disabled={sending || !selectedJob} onClick={() => void send(text)}>{text}</Button>)}</div>}
    </div>
    <div className="p-4 space-y-3">
      {timeline.length === 0 ? <div className="py-12 text-center text-muted-foreground"><MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-40"/><p>No messages for this job</p></div> : timeline.map((item) => {
        const messageChannel = String(item.payload.channel ?? (item.item_type === "system_event" ? "system" : "dispatch"));
        const body = String(item.payload.content ?? item.payload.note ?? item.payload.event_type ?? "Job activity");
        const delivery = item.payload.delivery as { status?: string } | null | undefined;
        return <Card key={`${item.item_type}-${item.id}`}><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1"><Badge variant={messageChannel === "dispatch" ? "default" : "outline"}>{messageChannel.replace("_", " ")}</Badge><Badge variant="secondary">{item.item_type.replace("_", " ")}</Badge>{delivery?.status && <Badge variant="outline">{delivery.status}</Badge>}</div>
          <p className="text-sm whitespace-pre-wrap">{body}</p><div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>{item.item_type === "human_message" && <CheckCheck className="h-3.5 w-3.5"/>}</div>
        </CardContent></Card>;
      })}
    </div>
  </div>;
}
