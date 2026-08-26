/**
 * AutomationRuleDialog — full editor for retention automation rules.
 * Supports trigger, conditions, audience filter, multi-action with inline message
 * body + {{variables}}, frequency cooldown, and a live message preview.
 */
import { useState, useEffect, useMemo } from "react";
import type { Json } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  createAutomationRule,
  updateAutomationRule,
  type AutomationRulePayload,
} from "@/application/commands/automation-rules.command";
import { toast } from "@/components/ui/sonner";
import { Plus, Trash2, Eye, Settings2 } from "lucide-react";
import {
  TEMPLATE_VARIABLES,
  renderTemplate,
} from "@/lib/retention/automation-templates";

const TRIGGER_TYPES = [
  { value: "signal.winback_candidate", label: "Win-back Candidate (lapsed customer)" },
  { value: "signal.vehicle_overdue", label: "Vehicle Overdue" },
  { value: "signal.vehicle_at_risk", label: "Vehicle At Risk" },
  { value: "signal.payment_received", label: "Payment Received" },
  { value: "signal.appointment_cancelled", label: "Appointment Cancelled" },
  { value: "signal.appointment_booked", label: "Appointment Booked" },
  { value: "signal.service_completed", label: "Service Completed" },
  { value: "signal.loyalty_milestone", label: "Loyalty Milestone" },
  { value: "signal.subscription_expiring", label: "Subscription Expiring" },
  { value: "signal.birthday", label: "Birthday / Anniversary" },
  { value: "signal.booking_abandoned", label: "Booking Abandoned (didn't finish)" },
];

const ACTION_TYPES = [
  { value: "send_email", label: "Send Email" },
  { value: "send_sms", label: "Send SMS" },
  { value: "award_points", label: "Award Loyalty Points" },
  { value: "issue_reward", label: "Issue Reward" },
  { value: "create_task", label: "Create Follow-up Task" },
  { value: "update_segment", label: "Update Customer Segment" },
];

interface ActionItem {
  type: string;
  template?: string;
  subject?: string;
  body?: string;
  config?: Record<string, string | number>;
}

interface AutomationRule {
  id: string;
  name: string;
  is_active: boolean;
  priority: number;
  trigger_jsonb: Record<string, unknown>;
  actions_jsonb: ActionItem[];
  conditions_jsonb: Record<string, unknown> | null;
  audience_jsonb: Record<string, unknown> | null;
  frequency_guard_jsonb: Record<string, unknown> | null;
}

interface AutomationRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  editRule?: AutomationRule | null;
  onSaved: () => void;
}

export function AutomationRuleDialog({
  open,
  onOpenChange,
  userId,
  editRule,
  onSaved,
}: AutomationRuleDialogProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [priority, setPriority] = useState(50);
  const [triggerType, setTriggerType] = useState("");
  const [actions, setActions] = useState<ActionItem[]>([{ type: "" }]);
  const [frequencyHours, setFrequencyHours] = useState("");

  // Conditions
  const [scoreMin, setScoreMin] = useState("");
  const [daysOverdueMin, setDaysOverdueMin] = useState("");

  // Audience
  const [minLifetimeValue, setMinLifetimeValue] = useState("");
  const [requiredSegment, setRequiredSegment] = useState("");

  // Populate form on edit
  useEffect(() => {
    if (editRule) {
      setName(editRule.name);
      setIsActive(editRule.is_active);
      setPriority(editRule.priority);
      setTriggerType((editRule.trigger_jsonb as Record<string, string>)?.type || "");
      const acts = editRule.actions_jsonb as ActionItem[] | null;
      setActions(acts?.length ? acts : [{ type: "" }]);
      const freq = editRule.frequency_guard_jsonb as Record<string, number> | null;
      setFrequencyHours(freq?.min_hours_between?.toString() || "");

      const conds = editRule.conditions_jsonb as Record<string, { gte?: number }> | null;
      setScoreMin(conds?.score?.gte?.toString() || "");
      setDaysOverdueMin(conds?.days_overdue?.gte?.toString() || "");

      const aud = editRule.audience_jsonb as { minLifetimeValue?: number; segments?: string[] } | null;
      setMinLifetimeValue(aud?.minLifetimeValue?.toString() || "");
      setRequiredSegment(aud?.segments?.[0] || "");
    } else {
      setName("");
      setIsActive(true);
      setPriority(50);
      setTriggerType("");
      setActions([{ type: "" }]);
      setFrequencyHours("");
      setScoreMin("");
      setDaysOverdueMin("");
      setMinLifetimeValue("");
      setRequiredSegment("");
    }
  }, [editRule, open]);

  const addAction = () => setActions([...actions, { type: "" }]);
  const removeAction = (idx: number) => setActions(actions.filter((_, i) => i !== idx));
  const updateAction = (idx: number, patch: Partial<ActionItem>) => {
    const updated = [...actions];
    updated[idx] = { ...updated[idx], ...patch };
    setActions(updated);
  };
  const updateActionConfig = (idx: number, key: string, value: string) => {
    const updated = [...actions];
    const num = Number(value);
    const cfg = { ...(updated[idx].config || {}) };
    cfg[key] = Number.isFinite(num) && value !== "" && /^\d+(\.\d+)?$/.test(value) ? num : value;
    updated[idx] = { ...updated[idx], config: cfg };
    setActions(updated);
  };

  // Build conditions/audience JSON from form state
  const conditionsJson = useMemo(() => {
    const c: Record<string, { gte: number }> = {};
    if (scoreMin) c.score = { gte: parseFloat(scoreMin) };
    if (daysOverdueMin) c.days_overdue = { gte: parseInt(daysOverdueMin, 10) };
    return Object.keys(c).length ? c : null;
  }, [scoreMin, daysOverdueMin]);

  const audienceJson = useMemo(() => {
    const a: { minLifetimeValue?: number; segments?: string[] } = {};
    if (minLifetimeValue) a.minLifetimeValue = parseFloat(minLifetimeValue);
    if (requiredSegment) a.segments = [requiredSegment];
    return Object.keys(a).length ? a : null;
  }, [minLifetimeValue, requiredSegment]);

  const handleSave = async () => {
    setSaveError(null);
    if (!userId) {
      const message = "Please wait until authentication finishes before saving this rule.";
      setSaveError(message);
      toast.error(message);
      return;
    }
    if (!name.trim()) {
      toast.error("Rule name is required");
      return;
    }
    if (!triggerType) {
      toast.error("Trigger type is required");
      return;
    }
    const filledActions = actions.filter((a) => a.type);
    if (!filledActions.length) {
      toast.error("At least one action is required");
      return;
    }

    setSaving(true);
    const payload: AutomationRulePayload = {
      user_id: userId,
      name: name.trim(),
      is_active: isActive,
      priority: Math.max(0, Math.min(100, Math.trunc(Number(priority) || 0))),
      trigger_jsonb: { type: triggerType } as Json,
      actions_jsonb: filledActions as unknown as Json,
      conditions_jsonb: (conditionsJson ?? {}) as Json,
      audience_jsonb: (audienceJson ?? {}) as Json,
      frequency_guard_jsonb: frequencyHours
        ? ({ min_hours_between: parseInt(frequencyHours, 10) } as Json)
        : ({} as Json),
    };

    try {
      if (editRule) await updateAutomationRule(editRule.id, payload);
      else await createAutomationRule(payload);
      toast.success(editRule ? "Rule updated" : "Rule created");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save rule";
      setSaveError(message);
      toast.error(message);
      console.error(error);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editRule ? "Edit Automation Rule" : "Create Automation Rule"}</DialogTitle>
          <DialogDescription>
            Trigger → conditions → audience → actions. Use {`{{variables}}`} in messages — they
            resolve at send time.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basics" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basics" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Basics
            </TabsTrigger>
            <TabsTrigger value="filters">Conditions</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Preview
            </TabsTrigger>
          </TabsList>

          {/* ── Basics ── */}
          <TabsContent value="basics" className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label>Rule Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Overdue Vehicle Follow-up"
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Label className="shrink-0">Priority</Label>
                <Input
                  type="number"
                  className="w-20"
                  value={priority}
                  onChange={(e) => setPriority(Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))))}
                  min={0}
                  max={100}
                />
                <span className="text-xs text-muted-foreground">0–100, higher runs first</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>Trigger</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trigger..." />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Cooldown (frequency guard)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="0"
                  value={frequencyHours}
                  onChange={(e) => setFrequencyHours(e.target.value)}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  min hours between firings per customer
                </span>
              </div>
            </div>
          </TabsContent>

          {/* ── Conditions + Audience ── */}
          <TabsContent value="filters" className="space-y-4 pt-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Signal Conditions
              </Label>
              <p className="text-xs text-muted-foreground mb-3">
                Only fire when the signal payload meets these thresholds.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Min score (0–1)</Label>
                  <Input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={scoreMin}
                    onChange={(e) => setScoreMin(e.target.value)}
                    placeholder="e.g. 0.6"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Min days overdue</Label>
                  <Input
                    type="number"
                    min={0}
                    value={daysOverdueMin}
                    onChange={(e) => setDaysOverdueMin(e.target.value)}
                    placeholder="e.g. 14"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Audience Filter
              </Label>
              <p className="text-xs text-muted-foreground mb-3">
                Restrict to customers matching these criteria.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Min lifetime value ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={minLifetimeValue}
                    onChange={(e) => setMinLifetimeValue(e.target.value)}
                    placeholder="e.g. 500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Required segment</Label>
                  <Input
                    value={requiredSegment}
                    onChange={(e) => setRequiredSegment(e.target.value)}
                    placeholder="e.g. vip"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Actions ── */}
          <TabsContent value="actions" className="space-y-4 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Actions</Label>
                <p className="text-xs text-muted-foreground">Run in order when the rule matches.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addAction} className="gap-1">
                <Plus className="h-3 w-3" /> Add Action
              </Button>
            </div>

            {actions.map((action, idx) => (
              <div key={idx} className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Select
                    value={action.type}
                    onValueChange={(v) => updateAction(idx, { type: v })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Action type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {actions.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAction(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                {/* Email-specific fields */}
                {action.type === "send_email" && (
                  <div className="space-y-2">
                    <Input
                      placeholder="Template ID (optional)"
                      value={action.template || ""}
                      onChange={(e) => updateAction(idx, { template: e.target.value })}
                    />
                    <Input
                      placeholder="Subject (e.g., Hi {{customer_first_name}}!)"
                      value={action.subject || ""}
                      onChange={(e) => updateAction(idx, { subject: e.target.value })}
                    />
                    <Textarea
                      placeholder="Email body — supports {{variables}}"
                      value={action.body || ""}
                      onChange={(e) => updateAction(idx, { body: e.target.value })}
                      rows={4}
                    />
                  </div>
                )}

                {action.type === "send_sms" && (
                  <Textarea
                    placeholder="SMS body — supports {{variables}}, keep under 160 chars"
                    value={action.body || ""}
                    onChange={(e) => updateAction(idx, { body: e.target.value })}
                    rows={3}
                  />
                )}

                {action.type === "award_points" && (
                  <Input
                    type="number"
                    placeholder="Points to award"
                    value={(action.config?.points as string) || ""}
                    onChange={(e) => updateActionConfig(idx, "points", e.target.value)}
                  />
                )}

                {action.type === "create_task" && (
                  <Textarea
                    placeholder="Task description (supports {{variables}})"
                    value={(action.config?.description as string) || ""}
                    onChange={(e) => updateActionConfig(idx, "description", e.target.value)}
                    rows={2}
                  />
                )}

                {action.type === "issue_reward" && (
                  <Input
                    placeholder="Reward ID (from Loyalty tab)"
                    value={(action.config?.reward_id as string) || ""}
                    onChange={(e) => updateActionConfig(idx, "reward_id", e.target.value)}
                  />
                )}

                {action.type === "update_segment" && (
                  <Input
                    placeholder="Target segment (e.g., vip)"
                    value={(action.config?.segment as string) || ""}
                    onChange={(e) => updateActionConfig(idx, "segment", e.target.value)}
                  />
                )}
              </div>
            ))}
          </TabsContent>

          {/* ── Preview ── */}
          <TabsContent value="preview" className="space-y-4 pt-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Available variables
              </Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {TEMPLATE_VARIABLES.map((v) => (
                  <Badge key={v.token} variant="secondary" className="font-mono text-[10px]">
                    {v.token}
                  </Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Preview uses sample values. Real customer data substitutes at send time.
              </p>
            </div>

            {actions.filter((a) => a.body || a.subject).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Add an Action with a body or subject to see a preview.
              </p>
            ) : (
              <div className="space-y-3">
                {actions.map((a, i) => {
                  if (!a.body && !a.subject) return null;
                  return (
                    <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          Action {i + 1} · {a.type || "—"}
                        </Badge>
                      </div>
                      {a.subject && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Subject
                          </p>
                          <p className="text-sm font-semibold">{renderTemplate(a.subject)}</p>
                        </div>
                      )}
                      {a.body && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Body
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{renderTemplate(a.body)}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {saveError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {saveError}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !userId}>
            {saving ? "Saving..." : editRule ? "Update Rule" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
