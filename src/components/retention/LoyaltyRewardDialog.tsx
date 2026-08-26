import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveLoyaltyReward } from "@/application/commands/loyalty-reward.command";
import { toast } from "@/components/ui/sonner";

const REWARD_TYPES = [
  { value: "credit", label: "Account Credit" },
  { value: "free_service", label: "Free Service" },
  { value: "discount_percent", label: "Discount (%)" },
  { value: "discount_fixed", label: "Discount ($)" },
  { value: "priority_booking", label: "Priority Booking" },
] as const;

type RewardType = typeof REWARD_TYPES[number]["value"];

interface LoyaltyReward {
  id: string;
  name: string;
  description: string | null;
  points_required: number;
  reward_type: RewardType;
  config_jsonb: Record<string, unknown> | null;
  status: string;
  program_id: string;
}

interface LoyaltyRewardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  programId: string;
  editReward?: LoyaltyReward | null;
  onSaved: () => void;
}

export function LoyaltyRewardDialog({
  open,
  onOpenChange,
  userId,
  programId,
  editReward,
  onSaved,
}: LoyaltyRewardDialogProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pointsRequired, setPointsRequired] = useState("100");
  const [rewardType, setRewardType] = useState<RewardType>("credit");
  const [configValue, setConfigValue] = useState("");

  useEffect(() => {
    if (editReward) {
      setName(editReward.name);
      setDescription(editReward.description || "");
      setPointsRequired(editReward.points_required.toString());
      setRewardType(editReward.reward_type);
      const cfg = editReward.config_jsonb as Record<string, string> | null;
      setConfigValue(cfg?.value?.toString() || cfg?.amount?.toString() || "");
    } else {
      setName("");
      setDescription("");
      setPointsRequired("100");
      setRewardType("credit");
      setConfigValue("");
    }
  }, [editReward, open]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Reward name is required"); return; }

    setSaving(true);
    try {
      await saveLoyaltyReward({
        userId,
        programId,
        name: name.trim(),
        description: description.trim() || null,
        pointsRequired: parseInt(pointsRequired, 10) || 100,
        rewardType,
        configValue,
      }, editReward?.id);

      toast.success(editReward ? "Reward updated" : "Reward created");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Failed to save reward");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editReward ? "Edit Reward" : "Create Reward"}</DialogTitle>
          <DialogDescription>
            Define a reward customers can redeem with their loyalty points.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Reward Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Free Oil Change" />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this reward include?" rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Points Required</Label>
              <Input type="number" value={pointsRequired} onChange={(e) => setPointsRequired(e.target.value)} min="1" />
            </div>
            <div className="space-y-1.5">
              <Label>Reward Type</Label>
              <Select value={rewardType} onValueChange={(v) => setRewardType(v as RewardType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REWARD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contextual value field */}
          {(rewardType === "credit" || rewardType === "discount_fixed") && (
            <div className="space-y-1.5">
              <Label>{rewardType === "credit" ? "Credit Amount ($)" : "Discount Amount ($)"}</Label>
              <Input type="number" step="0.01" value={configValue} onChange={(e) => setConfigValue(e.target.value)} placeholder="e.g., 10.00" />
            </div>
          )}
          {rewardType === "discount_percent" && (
            <div className="space-y-1.5">
              <Label>Discount Percentage</Label>
              <Input type="number" step="1" value={configValue} onChange={(e) => setConfigValue(e.target.value)} placeholder="e.g., 15" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editReward ? "Update Reward" : "Create Reward"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
