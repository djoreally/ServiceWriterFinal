import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateDispatchRule, type DispatchRule } from "@/application/queries/weather-guard.query";

export function RulesDrawer({
  rules,
  onChange,
}: {
  rules: DispatchRule[];
  onChange: () => void;
}) {
  const toggle = async (rule: DispatchRule, field: "active" | "auto_execute", value: boolean) => {
    try {
      await updateDispatchRule(rule.id, { [field]: value });
      toast.success("Rule updated");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Dispatch rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground">No rules configured yet.</p>
        )}
        {rules.map((r) => (
          <div key={r.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{r.name}</p>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {r.action.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Trigger when risk ≥ {r.condition.weather_risk_gte ?? "—"}
              {r.condition.scope ? ` · scope: ${r.condition.scope}` : ""}
            </p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  id={`active-${r.id}`}
                  checked={r.active}
                  onCheckedChange={(v) => toggle(r, "active", v)}
                />
                <Label htmlFor={`active-${r.id}`} className="text-xs">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={`auto-${r.id}`}
                  checked={r.auto_execute}
                  onCheckedChange={(v) => toggle(r, "auto_execute", v)}
                />
                <Label htmlFor={`auto-${r.id}`} className="text-xs">Auto-execute</Label>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
