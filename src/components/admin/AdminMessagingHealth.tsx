import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { MessageSquare, AlertTriangle, Reply, Ban, CheckCircle2 } from "lucide-react";
import { fetchAdminMessagingHealth, type MessagingHealthStats } from "@/application/queries/admin-messaging-health.query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AdminMessagingHealth() {
  const [stats, setStats] = useState<MessagingHealthStats>({
    smsEnabledTenants: 0,
    marketingEmailTenants: 0,
    outbound: 0,
    failed: 0,
    replies: 0,
    optOuts: 0,
    exhaustedBundles: 0,
    a2pBlocked: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMessagingHealth() {
      const nextStats = await fetchAdminMessagingHealth();
      if (active) {
        setStats(nextStats);
      }
    }

    loadMessagingHealth().catch((err) => {
      if (active) setError(errorMessage(err, "The backend did not return messaging health."));
    });

    return () => {
      active = false;
    };
  }, []);

  const failureRate = stats.outbound + stats.failed > 0
    ? Math.round((stats.failed / (stats.outbound + stats.failed)) * 100)
    : 0;
  const alerts = [
    ...(failureRate >= 10 ? [`SMS failure rate is ${failureRate}%`] : []),
    ...(stats.exhaustedBundles > 0 ? [`${stats.exhaustedBundles} tenant(s) have exhausted SMS bundles`] : []),
    ...(stats.a2pBlocked > 0 ? [`${stats.a2pBlocked} tenant(s) are blocked by A2P status`] : []),
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Messaging Health
            </CardTitle>
            <CardDescription>Platform-wide SMS and marketing messaging status</CardDescription>
          </div>
          <Badge variant={failureRate >= 10 ? "destructive" : "secondary"}>
            {failureRate}% failure rate
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {alerts.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Messaging alerts
            </div>
            <ul className="list-disc pl-6 text-sm text-amber-700 dark:text-amber-300">
              {alerts.map((alert) => (
                <li key={alert}>{alert}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <MessagingHealthMetric icon={<CheckCircle2 className="h-4 w-4" />} label="SMS tenants" value={stats.smsEnabledTenants} />
          <MessagingHealthMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Email add-ons" value={stats.marketingEmailTenants} />
          <MessagingHealthMetric icon={<MessageSquare className="h-4 w-4" />} label="Sent/delivered" value={stats.outbound} />
          <MessagingHealthMetric icon={<AlertTriangle className="h-4 w-4" />} label="Failed" value={stats.failed} />
          <MessagingHealthMetric icon={<Reply className="h-4 w-4" />} label="Replies" value={stats.replies} />
          <MessagingHealthMetric icon={<Ban className="h-4 w-4" />} label="Opt-outs" value={stats.optOuts} />
          <MessagingHealthMetric icon={<AlertTriangle className="h-4 w-4" />} label="Exhausted" value={stats.exhaustedBundles} />
          <MessagingHealthMetric icon={<AlertTriangle className="h-4 w-4" />} label="A2P blocked" value={stats.a2pBlocked} />
        </div>
      </CardContent>
    </Card>
  );
}

function MessagingHealthMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
