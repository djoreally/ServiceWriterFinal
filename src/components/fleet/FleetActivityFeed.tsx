import { Badge } from "@/components/ui/badge";
import type { Json } from "@/integrations/supabase/types";
import {
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Send,
  DollarSign,
  Camera,
  MessageSquare,
  Play,
  PauseCircle,
  ShieldCheck,
  ShieldX,
  CalendarClock,
  Truck,
  Receipt,
  CreditCard,
  Paperclip,
  type LucideIcon,
} from "lucide-react";

interface ActivityLog {
  id: string;
  action: string;
  details: Json | null;
  actor_role: string;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  created: { icon: FileText, label: "Work order created", color: "text-blue-500" },
  submitted: { icon: Send, label: "Submitted for review", color: "text-blue-600" },
  accepted: { icon: CheckCircle, label: "Accepted by provider", color: "text-emerald-500" },
  scheduled: { icon: CalendarClock, label: "Scheduled", color: "text-blue-500" },
  reschedule_proposed: { icon: Clock, label: "Reschedule proposed", color: "text-amber-500" },
  clarification_requested: { icon: MessageSquare, label: "Clarification requested", color: "text-amber-500" },
  in_progress: { icon: Play, label: "Service started", color: "text-amber-600" },
  approval_requested: { icon: AlertTriangle, label: "Approval requested", color: "text-orange-500" },
  approval_granted: { icon: ShieldCheck, label: "Approval granted", color: "text-emerald-500" },
  approval_rejected: { icon: ShieldX, label: "Approval rejected", color: "text-red-500" },
  completed: { icon: CheckCircle, label: "Service completed", color: "text-emerald-600" },
  invoice_generated: { icon: Receipt, label: "Invoice generated", color: "text-purple-500" },
  payment_received: { icon: CreditCard, label: "Payment received", color: "text-gray-600" },
  note_added: { icon: MessageSquare, label: "Note added", color: "text-muted-foreground" },
  photo_added: { icon: Camera, label: "Photo added", color: "text-muted-foreground" },
  po_attached: { icon: Paperclip, label: "PO attached", color: "text-blue-500" },
  status_changed: { icon: PauseCircle, label: "Status changed", color: "text-muted-foreground" },
};

function isJsonRecord(value: Json | null): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ROLE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  provider: { label: "Provider", variant: "default" },
  fleet_manager: { label: "Fleet", variant: "secondary" },
  system: { label: "System", variant: "outline" },
};

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function FleetActivityFeed({ logs }: { logs: ActivityLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

      <div className="space-y-0">
        {logs.map((log, idx) => {
          const config = ACTION_CONFIG[log.action] || ACTION_CONFIG.status_changed;
          const role = ROLE_LABELS[log.actor_role] || ROLE_LABELS.system;
          const Icon = config.icon;
          const details = isJsonRecord(log.details) ? log.details : {};
          const message = typeof details.message === "string" ? details.message : null;
          const oldStatus = typeof details.old_status === "string" ? details.old_status : null;
          const newStatus = typeof details.new_status === "string" ? details.new_status : null;
          const amount = typeof details.amount === "number" ? details.amount : null;
          const poNumber = typeof details.po_number === "string" ? details.po_number : null;

          return (
            <div key={log.id} className="relative flex gap-3 py-3 pl-1">
              {/* Icon dot */}
              <div className={`relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-background border border-border`}>
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{config.label}</span>
                  <Badge variant={role.variant} className="text-[10px] px-1.5 py-0">
                    {role.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {formatRelativeTime(log.created_at)}
                  </span>
                </div>

                {message && (
                  <p className="text-xs text-muted-foreground mt-1">{message}</p>
                )}

                {oldStatus && newStatus && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {oldStatus.replace("_", " ")} → {newStatus.replace("_", " ")}
                  </p>
                )}

                {amount != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Amount: ${amount.toFixed(2)}
                  </p>
                )}

                {poNumber && (
                  <p className="text-xs text-muted-foreground mt-1">
                    PO: {poNumber}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
