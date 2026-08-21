import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, Copy, Gift, History, Loader2, Sparkles, Tag, Trophy } from "lucide-react";
import { toast } from "sonner";
import { fetchCustomerPortalExperience, type CustomerAccountData, type CustomerPortalExperience } from "@/application/queries/customer-dashboard.query";
import { formatMoney } from "@/lib/financialMath";

interface Props {
  account: CustomerAccountData;
}

function formatDiscount(type: string, value: number) {
  return type === "percentage" ? `${value}% off` : `$${formatMoney(value)} off`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function CustomerRewardsTab({ account }: Props) {
  const [loading, setLoading] = useState(true);
  const [experience, setExperience] = useState<CustomerPortalExperience | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchCustomerPortalExperience(account);
        if (active) setExperience(data);
      } catch (error) {
        console.error("[CustomerRewardsTab] Failed to load rewards", error);
        if (active) setExperience(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [account]);

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success("Coupon code copied");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const points = experience?.rewardPoints ?? 0;
  const availableRewards = experience?.issuedRewards.filter((reward) => reward.status === "issued") ?? [];
  const redeemedRewards = experience?.issuedRewards.filter((reward) => reward.status === "redeemed") ?? [];
  const nextReward = experience?.nextReward ?? null;
  const pointsNeeded = nextReward ? Math.max(0, nextReward.points_required - points) : 0;
  const progress = nextReward?.points_required ? Math.min(100, (points / nextReward.points_required) * 100) : 100;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-3 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reward points</p>
                <p className="text-2xl font-bold">{points.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Reward visits</p>
            <p className="mt-1 text-2xl font-bold">{experience?.completedServices ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Reward-tracked spend</p>
            <p className="mt-1 text-2xl font-bold">${formatMoney(experience?.totalSpent ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Next reward
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {nextReward ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{nextReward.name}</p>
                  <p className="text-sm text-muted-foreground">{nextReward.description || nextReward.program_name || "Loyalty reward"}</p>
                </div>
                <Badge variant="outline">{nextReward.points_required.toLocaleString()} points</Badge>
              </div>
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">
                {pointsNeeded > 0 ? `${pointsNeeded.toLocaleString()} points until this reward.` : "You have enough points for this reward."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Rewards are being prepared by your service provider. Check back soon.</p>
          )}
        </CardContent>
      </Card>

      {experience?.accounts.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-primary" /> Loyalty accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {experience.accounts.map((account) => (
              <div key={account.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{account.program_name || "Loyalty program"}</p>
                    <p className="text-sm text-muted-foreground">Tier: {account.tier}</p>
                  </div>
                  <Badge variant={account.status === "active" ? "default" : "secondary"}>{account.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><p className="font-semibold">{account.points_balance.toLocaleString()}</p><p className="text-muted-foreground">points</p></div>
                  <div><p className="font-semibold">{account.visit_count.toLocaleString()}</p><p className="text-muted-foreground">visits</p></div>
                  <div><p className="font-semibold">${formatMoney(account.lifetime_spend_cents / 100)}</p><p className="text-muted-foreground">tracked</p></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-primary" /> Available rewards
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableRewards.length ? availableRewards.map((reward) => (
            <div key={reward.id} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{reward.reward_name}</p>
                  <p className="text-sm text-muted-foreground">{reward.reward_description || reward.program_name || "Issued loyalty reward"}</p>
                  {reward.expires_at && <p className="mt-1 text-xs text-muted-foreground">Expires {formatDate(reward.expires_at)}</p>}
                </div>
                <Badge>Available</Badge>
              </div>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">No issued rewards are available yet. Keep completing services to unlock rewards automatically.</p>
          )}
          {redeemedRewards.length ? (
            <p className="text-xs text-muted-foreground">{redeemedRewards.length} redeemed reward{redeemedRewards.length === 1 ? "" : "s"} in your history.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-primary" /> Available coupons
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {experience?.phoneCouponHint && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                {experience.phoneCouponHint}
              </div>
            )}
            {experience?.coupons.length ? experience.coupons.map((coupon) => (
              <div key={coupon.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-semibold">{coupon.code}</p>
                    <Badge>{formatDiscount(coupon.discount_type, Number(coupon.discount_value))}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {coupon.description || "Apply this at checkout."}
                    {coupon.min_order_amount ? ` Minimum order $${formatMoney(coupon.min_order_amount)}.` : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyCode(coupon.code)}>
                  <Copy className="mr-1 h-3 w-3" /> Copy
                </Button>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No public coupons are available right now.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4 text-primary" /> Reward catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {experience?.rewards.length ? experience.rewards.map((reward) => (
              <div key={reward.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{reward.name}</p>
                    <p className="text-sm text-muted-foreground">{reward.description || reward.program_name || "Loyalty reward"}</p>
                  </div>
                  <Badge variant="outline">{reward.points_required.toLocaleString()}</Badge>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Your provider has not published a reward catalog yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> Rewards activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {experience?.ledger.length ? experience.ledger.slice(0, 8).map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-semibold capitalize">{event.event_type.replace(/_/g, " ")}</p>
                <p className="text-sm text-muted-foreground">{event.program_name || "Loyalty program"}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> {formatDate(event.occurred_at) || formatDate(event.created_at)}</p>
              </div>
              <div className="text-right">
                <Badge variant={event.points_delta >= 0 ? "default" : "secondary"}>
                  {event.points_delta > 0 ? "+" : ""}{event.points_delta.toLocaleString()} pts
                </Badge>
                {event.balance_after != null && <p className="mt-1 text-xs text-muted-foreground">Balance {event.balance_after.toLocaleString()}</p>}
              </div>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">Rewards activity will appear here after completed appointments award points.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
