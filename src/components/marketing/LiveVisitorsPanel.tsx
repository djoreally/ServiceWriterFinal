import { useEffect, useState, useCallback } from "react";
import { fetchLiveVisitors, type LiveVisitorEvent, type LiveVisitorPresence } from "@/application/queries/marketing-live-visitors.query";
import { subscribeLiveVisitorsChannel } from "@/application/queries/marketing.query";
import { useAuth } from "@packages/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

export function LiveVisitorsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LiveVisitorPresence[]>([]);
  const [events, setEvents] = useState<LiveVisitorEvent[]>([]);

  const refreshLiveVisitors = useCallback(async () => {
    if (!user?.id) return;
    const cutoff = new Date(Date.now() - 120_000).toISOString();
    const data = await fetchLiveVisitors(user.id, cutoff);
    setRows(data.rows);
    setEvents(data.events);
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(() => refreshLiveVisitors());
    if (!user?.id) return;
    const { unsubscribe } = subscribeLiveVisitorsChannel(() => void refreshLiveVisitors());
    return unsubscribe;
  }, [user?.id, refreshLiveVisitors]);

  const distinct = new Set(rows.map((r) => r.visitor_id));
  const active = new Set(rows.filter((r) => r.state === "active").map((r) => r.visitor_id));
  const idle = new Set(rows.filter((r) => r.state === "idle").map((r) => r.visitor_id));
  const topPages = Object.entries(rows.reduce((acc, r) => { const k = r.current_path || "/"; acc[k] = (acc[k] || 0) + 1; return acc; }, {} as Record<string, number>)).sort((a,b)=>b[1]-a[1]).slice(0,5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-green-600" />Live Visitors <Badge>{distinct.size} live</Badge></CardTitle>
        <CardDescription>Distinct visitor presence (active/idle) with realtime freshness.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-2"><Badge variant="secondary">Active: {active.size}</Badge><Badge variant="outline">Idle: {idle.size}</Badge></div>
        <div><p className="font-medium">Top Active Pages</p>{topPages.map(([p,c]) => <p key={p}>{p} · {c}</p>)}</div>
        <div><p className="font-medium">Live Event Feed</p>{events.slice(0,8).map((e,i)=><p key={i}>{e.event_name} · {new Date(e.created_at).toLocaleTimeString()}</p>)}</div>
      </CardContent>
    </Card>
  );
}
