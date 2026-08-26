import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle, XCircle, Clock, ShieldCheck, DollarSign } from "lucide-react";
import { respondToFleetApproval } from "@/application/commands/fleet-approval.command";
import { toast } from "@/components/ui/sonner";

interface Approval {
  id: string;
  fleet_work_order_id: string;
  requested_by: string;
  approval_type: string;
  title: string;
  description: string | null;
  estimated_cost: number | null;
  status: string;
  responded_by: string | null;
  response_notes: string | null;
  responded_at: string | null;
  created_at: string;
}

interface Props {
  approvals: Approval[];
  onRefresh: () => void;
  userId: string;
}

const TYPE_LABELS: Record<string, string> = {
  additional_repair: "Additional Repair",
  over_threshold: "Over Threshold",
  schedule_change: "Schedule Change",
  scope_change: "Scope Change",
};

const STATUS_STYLES: Record<string, { icon: any; color: string; bg: string }> = {
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
  approved: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  rejected: { icon: XCircle, color: "text-red-600", bg: "bg-red-500/10" },
  modified: { icon: ShieldCheck, color: "text-blue-600", bg: "bg-blue-500/10" },
};

export function FleetApprovalEngine({ approvals, onRefresh, userId }: Props) {
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseNotes, setResponseNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleRespond = async (approvalId: string, decision: "approved" | "rejected") => {
    setSubmitting(true);
    try {
      const approval = approvals.find((a) => a.id === approvalId);
      if (!approval) return;

      await respondToFleetApproval({
        approvalId,
        decision,
        responseNotes: responseNotes || undefined,
        workOrderId: approval.fleet_work_order_id,
        userId,
        estimatedCost: approval.estimated_cost,
        title: approval.title,
      });

      toast.success(decision === "approved" ? "Approval granted" : "Approval rejected");
      setRespondingId(null);
      setResponseNotes("");
      onRefresh();
    } catch {
      toast.error("Failed to submit response");
    }
    setSubmitting(false);
  };

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

  if (approvals.length === 0) {
    return (
      <div className="text-center py-6">
        <ShieldCheck className="h-8 w-8 mx-auto text-emerald-500/40 mb-2" />
        <p className="text-sm text-muted-foreground">No approval requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
            Action Required ({pending.length})
          </p>
          {pending.map((approval) => (
            <Card key={approval.id} className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <span className="text-sm font-semibold">{approval.title}</span>
                  </div>
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 shrink-0">
                    {TYPE_LABELS[approval.approval_type] || approval.approval_type}
                  </Badge>
                </div>

                {approval.description && (
                  <p className="text-xs text-muted-foreground mb-2 ml-6">{approval.description}</p>
                )}

                {approval.estimated_cost != null && (
                  <div className="flex items-center gap-1 text-xs font-medium ml-6 mb-3">
                    <DollarSign className="h-3 w-3" />
                    Estimated: ${approval.estimated_cost.toFixed(2)}
                  </div>
                )}

                {respondingId === approval.id ? (
                  <div className="mt-3 ml-6 space-y-2">
                    <Textarea
                      placeholder="Response notes (optional)..."
                      value={responseNotes}
                      onChange={(e) => setResponseNotes(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleRespond(approval.id, "approved")}
                        disabled={submitting}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRespond(approval.id, "rejected")}
                        disabled={submitting}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setRespondingId(null); setResponseNotes(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 ml-6 mt-2">
                    <Button size="sm" variant="outline" onClick={() => setRespondingId(approval.id)}>
                      Respond
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resolved ({resolved.length})
          </p>
          {resolved.map((approval) => {
            const style = STATUS_STYLES[approval.status] || STATUS_STYLES.pending;
            const StatusIcon = style.icon;
            return (
              <div key={approval.id} className={`flex items-center gap-3 p-3 rounded-lg ${style.bg}`}>
                <StatusIcon className={`h-4 w-4 ${style.color} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{approval.title}</p>
                  {approval.response_notes && (
                    <p className="text-xs text-muted-foreground">{approval.response_notes}</p>
                  )}
                </div>
                <Badge variant="secondary" className={`${style.bg} ${style.color} shrink-0`}>
                  {approval.status}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
