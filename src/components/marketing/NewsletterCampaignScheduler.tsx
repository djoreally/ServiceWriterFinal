import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  listScheduledNewsletterCampaigns,
  scheduleNewsletterCampaign,
  cancelScheduledNewsletterCampaign,
} from "@/application/commands/marketing.command";

type Campaign = {
  id: string;
  subject: string;
  segment: string;
  send_at: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  finished_at: string | null;
};

const SEGMENTS = ["general", "fleet", "diy", "vip"];

function localDatetimeNow() {
  const d = new Date(Date.now() + 60 * 60 * 1000); // default +1h
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function NewsletterCampaignScheduler() {
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [segment, setSegment] = useState("general");
  const [html, setHtml] = useState("");
  const [sendAt, setSendAt] = useState(localDatetimeNow());
  const [busy, setBusy] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await listScheduledNewsletterCampaigns();
    setLoading(false);
    if (error) {
      toast({ title: "Failed to load campaigns", description: error.message, variant: "destructive" });
      return;
    }
    setCampaigns(data?.campaigns ?? []);
  }

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, []);

  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !html.trim() || !sendAt) {
      toast({ title: "Missing fields", description: "Subject, HTML body and send time are required.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await scheduleNewsletterCampaign({
      subject: subject.trim(),
      previewText: previewText.trim() || null,
      html,
      segment,
      sendAt: new Date(sendAt).toISOString(),
    });
    setBusy(false);
    if (error || !data?.ok) {
      toast({
        title: "Schedule failed",
        description: error?.message ?? data?.error ?? "Unknown error",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Scheduled", description: `Sends ${new Date(sendAt).toLocaleString()}.` });
    setSubject(""); setPreviewText(""); setHtml(""); setSendAt(localDatetimeNow());
    load();
  }

  async function cancel(id: string) {
    const { error } = await cancelScheduledNewsletterCampaign(id);
    if (error) {
      toast({ title: "Cancel failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cancelled" });
    load();
  }

  const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
    if (s === "sent") return "default";
    if (s === "failed") return "destructive";
    if (s === "cancelled") return "outline";
    return "secondary";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule monthly newsletter</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={schedule} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cs-subject">Subject</Label>
                <Input id="cs-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              </div>
              <div>
                <Label htmlFor="cs-preview">Preview text</Label>
                <Input id="cs-preview" value={previewText} onChange={(e) => setPreviewText(e.target.value)} maxLength={200} />
              </div>
              <div>
                <Label htmlFor="cs-segment">Segment</Label>
                <select
                  id="cs-segment"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                >
                  {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="cs-sendat">Send at (local time)</Label>
                <Input id="cs-sendat" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="cs-html">HTML body</Label>
              <Textarea
                id="cs-html"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={10}
                placeholder="<h1>Hello</h1><p>This month's update…</p>"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Unsubscribe footer and List-Unsubscribe headers are added automatically.
              </p>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Scheduling…" : "Schedule send"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled & sent campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(c.send_at).toLocaleString()} · segment: {c.segment} ·{" "}
                      {c.total_recipients} recipients · {c.sent_count} sent
                      {c.failed_count > 0 ? ` · ${c.failed_count} failed` : ""}
                      {c.skipped_count > 0 ? ` · ${c.skipped_count} skipped` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                    {c.status === "scheduled" && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(c.id)}>Cancel</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

