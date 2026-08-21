import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

interface Policy {
  id: string;
  enabled: boolean;
  monthly_cap_cents: number;
  lifetime_cap_cents: number;
  applies_to: string;
  currency: string;
}

interface TrainingModule {
  id: string;
  surface: string;
  slug: string;
  title: string;
  reward_cents: number;
  active: boolean;
  sort_order: number;
}

const centsToDollars = (c: number) => (c / 100).toFixed(2);
const dollarsToCents = (d: string) => Math.round(parseFloat(d || "0") * 100);

export const AdminTrainingRewards = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [modules, setModules] = useState<TrainingModule[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from("training_reward_policy").select("*").maybeSingle(),
      supabase.from("training_modules").select("*").order("surface").order("sort_order"),
    ]);
    if (p) setPolicy(p as Policy);
    if (m) setModules(m as TrainingModule[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const savePolicy = async () => {
    if (!policy) return;
    setSaving(true);
    const { error } = await supabase.from("training_reward_policy").update({
      enabled: policy.enabled,
      monthly_cap_cents: policy.monthly_cap_cents,
      lifetime_cap_cents: policy.lifetime_cap_cents,
      applies_to: policy.applies_to as any,
    }).eq("id", policy.id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Policy saved");
  };

  const saveModule = async (m: TrainingModule) => {
    const { error } = await supabase.from("training_modules").update({
      reward_cents: m.reward_cents,
      active: m.active,
    }).eq("id", m.id);
    if (error) toast.error(error.message); else toast.success(`Saved ${m.slug}`);
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Training Reward Policy</CardTitle>
          <CardDescription>Controls Stripe credits issued to Fleet OS subscribers on module completion.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policy && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enabled">Rewards enabled</Label>
                  <p className="text-xs text-muted-foreground">When off, completions record but no credits are issued.</p>
                </div>
                <Switch id="enabled" checked={policy.enabled} onCheckedChange={(v) => setPolicy({ ...policy, enabled: v })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Monthly cap (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToDollars(policy.monthly_cap_cents)}
                    onChange={(e) => setPolicy({ ...policy, monthly_cap_cents: dollarsToCents(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Lifetime cap (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToDollars(policy.lifetime_cap_cents)}
                    onChange={(e) => setPolicy({ ...policy, lifetime_cap_cents: dollarsToCents(e.target.value) })}
                  />
                </div>
              </div>
              <Button onClick={savePolicy} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save policy
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modules & Rewards</CardTitle>
          <CardDescription>Per-module reward amount. Only <code>fleet_os</code> modules issue Stripe credits.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Surface</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-32">Reward (USD)</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((m, i) => (
                <TableRow key={m.id}>
                  <TableCell><Badge variant={m.surface === "fleet_os" ? "default" : "outline"}>{m.surface}</Badge></TableCell>
                  <TableCell>
                    <div className="font-medium">{m.title}</div>
                    <div className="text-xs text-muted-foreground">{m.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={centsToDollars(m.reward_cents)}
                      onChange={(e) => {
                        const next = [...modules];
                        next[i] = { ...m, reward_cents: dollarsToCents(e.target.value) };
                        setModules(next);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.active}
                      onCheckedChange={(v) => {
                        const next = [...modules];
                        next[i] = { ...m, active: v };
                        setModules(next);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => saveModule(m)}>Save</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminTrainingRewards;
