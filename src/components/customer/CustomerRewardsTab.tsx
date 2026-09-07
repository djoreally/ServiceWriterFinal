import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, Trophy, Wrench, DollarSign } from "lucide-react";
import { fetchCustomerPortalExperience, type CustomerAccountData, type CustomerPortalExperience } from "@/application/queries/customer-dashboard.query";
import { formatMoney } from "@/lib/financialMath";

interface Props { account: CustomerAccountData }

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function CustomerRewardsTab({ account }: Props) {
  const [loading, setLoading] = useState(true);
  const [experience, setExperience] = useState<CustomerPortalExperience | null>(null);

  useEffect(() => {
    let active = true;
    void fetchCustomerPortalExperience(account)
      .then((data) => { if (active) setExperience(data); })
      .catch((error) => { console.error("[CustomerRewardsTab] Failed to load rewards", error); if (active) setExperience(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account]);

  if (loading) return <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card>;

  const points = experience?.rewardPoints ?? 0;
  const accounts = experience?.accounts ?? [];
  const ledger = experience?.ledger ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5"><CardContent className="p-5"><div className="flex items-center gap-3"><Trophy className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Reward points</p><p className="text-2xl font-bold">{points.toLocaleString()}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex items-center gap-3"><Wrench className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Completed services</p><p className="text-2xl font-bold">{experience?.completedServices ?? 0}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex items-center gap-3"><DollarSign className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Completed-service spend</p><p className="text-2xl font-bold">${formatMoney(experience?.totalSpent ?? 0)}</p></div></div></CardContent></Card>
      </div>

      {experience?.dashboardStatus === "not_enrolled" ? (
        <Card><CardContent className="py-8 text-center"><Trophy className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><h3 className="font-semibold">No loyalty account yet</h3><p className="mt-1 text-sm text-muted-foreground">Your service history is connected. Loyalty points will appear here if your service provider enrolls you in a rewards program.</p></CardContent></Card>
      ) : (
        <Card><CardHeader><CardTitle className="text-base">Loyalty balance</CardTitle></CardHeader><CardContent className="space-y-3">{accounts.map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-semibold">Rewards account</p><p className="text-xs text-muted-foreground">Enrolled {formatDate(entry.enrolled_at)}</p></div><Badge>{entry.current_points.toLocaleString()} points</Badge></div>)}</CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" /> Rewards activity</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {ledger.length ? ledger.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div><p className="font-semibold">{event.reason || "Rewards adjustment"}</p><p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p></div>
              <Badge variant={event.points_delta >= 0 ? "default" : "secondary"}>{event.points_delta > 0 ? "+" : ""}{event.points_delta.toLocaleString()} pts</Badge>
            </div>
          )) : <p className="text-sm text-muted-foreground">No rewards activity yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
