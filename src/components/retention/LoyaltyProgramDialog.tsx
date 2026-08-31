import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveLoyaltyProgram } from "@/application/commands";
import { toast } from "@/components/ui/sonner";

interface LoyaltyProgram {
  id: string;
  name: string;
  scope: string;
  status: string;
  earn_rules_jsonb: Record<string, unknown> | null;
}

interface LoyaltyProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  editProgram?: LoyaltyProgram | null;
  onSaved: () => void;
}

export function LoyaltyProgramDialog({
  open,
  onOpenChange,
  userId,
  editProgram,
  onSaved,
}: LoyaltyProgramDialogProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("per_vehicle");
  const [status, setStatus] = useState("active");
  const [pointsPerDollar, setPointsPerDollar] = useState("1");
  const [pointsPerVisit, setPointsPerVisit] = useState("10");

  useEffect(() => {
    if (editProgram) {
      void Promise.resolve().then(() => setName(editProgram.name));
      void Promise.resolve().then(() => setScope(editProgram.scope));
      void Promise.resolve().then(() => setStatus(editProgram.status));
      const rules = editProgram.earn_rules_jsonb as Record<string, number> | null;
      void Promise.resolve().then(() => setPointsPerDollar(rules?.points_per_dollar?.toString() || "1"));
      void Promise.resolve().then(() => setPointsPerVisit(rules?.points_per_visit?.toString() || "10"));
    } else {
      void Promise.resolve().then(() => setName(""));
      void Promise.resolve().then(() => setScope("per_vehicle"));
      void Promise.resolve().then(() => setStatus("active"));
      void Promise.resolve().then(() => setPointsPerDollar("1"));
      void Promise.resolve().then(() => setPointsPerVisit("10"));
    }
  }, [editProgram, open]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Program name is required"); return; }

    setSaving(true);
    try {
      await saveLoyaltyProgram(
        userId,
        {
          name: name.trim(),
          scope,
          status,
          pointsPerDollar: parseFloat(pointsPerDollar) || 1,
          pointsPerVisit: parseInt(pointsPerVisit, 10) || 10,
        },
        editProgram?.id,
      );
      toast.success(editProgram ? "Program updated" : "Program created");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to save program");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editProgram ? "Edit Loyalty Program" : "Create Loyalty Program"}</DialogTitle>
          <DialogDescription>
            Configure how customers earn and redeem loyalty points.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Program Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Oil Change Rewards" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_vehicle">Per Vehicle</SelectItem>
                  <SelectItem value="per_customer">Per Customer</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Points per $1 Spent</Label>
              <Input type="number" step="0.1" value={pointsPerDollar} onChange={(e) => setPointsPerDollar(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Points per Visit</Label>
              <Input type="number" value={pointsPerVisit} onChange={(e) => setPointsPerVisit(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editProgram ? "Update Program" : "Create Program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
