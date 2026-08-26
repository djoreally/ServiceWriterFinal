/**
 * AutoDispatchSettings
 *
 * Configures the dispatch algorithm that automatically assigns the best
 * technician (based on proximity, workload, skills, performance, and route
 * efficiency) to an appointment the moment it is created.
 *
 * This is not a tool — it is an algorithm toggle.
 */

import { useState, useEffect } from "react";
import {
  fetchDispatchConfig,
  type DispatchConfig,
} from "@/application/queries/dispatch-settings.query";
import {
  toggleAutoDispatch,
  saveDispatchWeights,
} from "@/application/commands/dispatch-settings.command";
import { useAuth } from "@packages/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { Zap, MapPin, BarChart2, DollarSign, Route, Info, Loader2 } from "lucide-react";

const DEFAULT_CONFIG: DispatchConfig = {
  auto_dispatch_enabled: false,
  dispatch_weight_distance: 30,
  dispatch_weight_load: 20,
  dispatch_weight_performance: 20,
  dispatch_weight_fairness: 15,
  dispatch_weight_route: 15,
  dispatch_fleet_performance_threshold: 60,
};

interface WeightRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}

function WeightRow({ icon, label, description, value, onChange, color }: WeightRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={color}>{icon}</span>
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-xs min-w-[3rem] justify-center">
          {value}%
        </Badge>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={50}
        step={5}
        className="py-1"
      />
    </div>
  );
}

export function AutoDispatchSettings() {
  const { user } = useAuth();
  const [config, setConfig] = useState<DispatchConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const totalWeight = config.dispatch_weight_distance +
    config.dispatch_weight_load +
    config.dispatch_weight_performance +
    config.dispatch_weight_fairness +
    config.dispatch_weight_route;

  const weightOk = totalWeight === 100;

  useEffect(() => {
    if (!user?.id) return;
    fetchDispatchConfig(user.id).then((data) => {
      if (data) setConfig(data);
      setLoading(false);
    });
  }, [user?.id]);

  const handleToggle = async (enabled: boolean) => {
    setConfig(c => ({ ...c, auto_dispatch_enabled: enabled }));
    try {
      await toggleAutoDispatch(user!.id, enabled);
      toast.success(enabled ? "⚡ Auto-dispatch enabled" : "Auto-dispatch disabled");
    } catch {
      toast.error("Failed to update auto-dispatch");
      setConfig(c => ({ ...c, auto_dispatch_enabled: !enabled }));
    }
  };

  const handleSaveWeights = async () => {
    if (!weightOk) {
      toast.error(`Weights must sum to 100% (currently ${totalWeight}%)`);
      return;
    }
    setSaving(true);
    try {
      await saveDispatchWeights(user!.id, config);
      toast.success("Dispatch weights saved");
    } catch {
      toast.error("Failed to save weights");
    }
    setSaving(false);
  };

  const set = (key: keyof DispatchConfig, value: number) =>
    setConfig(c => ({ ...c, [key]: value }));

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Auto-Dispatch</CardTitle>
                <CardDescription>
                  When enabled, new appointments are automatically assigned to the best available technician using the weighted scoring algorithm below.
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.auto_dispatch_enabled}
              onCheckedChange={handleToggle}
            />
          </div>
        </CardHeader>
        {config.auto_dispatch_enabled && (
          <CardContent className="pt-0">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                The algorithm runs hard filters first (skill match, capacity, geographic radius, availability) then scores eligible technicians using the weights below. The highest scorer is auto-assigned. If no technician qualifies, the appointment stays unassigned for manual dispatch.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Weight configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            Algorithm Weight Configuration
          </CardTitle>
          <CardDescription>
            Tune how the scoring algorithm prioritizes each factor. Weights must sum to 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <WeightRow
            icon={<MapPin className="h-4 w-4" />}
            label="Geographic Proximity"
            description="Closer technician = higher score"
            value={config.dispatch_weight_distance}
            onChange={(v) => set("dispatch_weight_distance", v)}
            color="text-blue-500"
          />
          <Separator />
          <WeightRow
            icon={<BarChart2 className="h-4 w-4" />}
            label="Workload Balance"
            description="Prefers techs with lighter daily schedule"
            value={config.dispatch_weight_load}
            onChange={(v) => set("dispatch_weight_load", v)}
            color="text-gray-500"
          />
          <Separator />
          <WeightRow
            icon={<Zap className="h-4 w-4" />}
            label="Performance Score"
            description="Revenue/hr + rating − redo rate composite"
            value={config.dispatch_weight_performance}
            onChange={(v) => set("dispatch_weight_performance", v)}
            color="text-yellow-500"
          />
          <Separator />
          <WeightRow
            icon={<DollarSign className="h-4 w-4" />}
            label="Revenue Fairness"
            description="Prevents one tech from hogging all revenue"
            value={config.dispatch_weight_fairness}
            onChange={(v) => set("dispatch_weight_fairness", v)}
            color="text-orange-500"
          />
          <Separator />
          <WeightRow
            icon={<Route className="h-4 w-4" />}
            label="Route Efficiency"
            description="Minimizes travel disruption to existing schedule"
            value={config.dispatch_weight_route}
            onChange={(v) => set("dispatch_weight_route", v)}
            color="text-purple-500"
          />

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Total:</span>
              <Badge variant={weightOk ? "default" : "destructive"} className="font-mono">
                {totalWeight}%
              </Badge>
              {!weightOk && (
                <span className="text-xs text-destructive">Must equal 100%</span>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleSaveWeights}
              disabled={saving || !weightOk}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Weights
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Fleet threshold */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Fleet Job Rules</CardTitle>
          <CardDescription>
            Fleet jobs have stricter requirements. Only technicians above the performance threshold are eligible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Minimum Performance Score for Fleet Jobs</Label>
              <Badge variant="outline" className="font-mono">{config.dispatch_fleet_performance_threshold}/100</Badge>
            </div>
            <Slider
              value={[config.dispatch_fleet_performance_threshold]}
              onValueChange={([v]) => set("dispatch_fleet_performance_threshold", v)}
              min={0}
              max={100}
              step={5}
              className="py-2"
            />
            <p className="text-xs text-muted-foreground">
              Fleet jobs also automatically shift the performance weight to 30% and require fleet certification.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleSaveWeights} disabled={saving}>
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
