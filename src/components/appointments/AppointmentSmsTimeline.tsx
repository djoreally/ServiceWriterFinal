/**
 * AppointmentSmsTimeline — chronological list of every SMS related to an
 * appointment (confirmation, reschedule, cancellation, reminder, inbound
 * replies/STOP). Reads from public.sms_logs via the existing tenant RLS.
 */
import { useQuery } from "@tanstack/react-query";
import {
  fetchAppointmentSmsTimeline,
  type AppointmentSmsTimelineRow,
} from "@/application/queries/sms.query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, ArrowDownLeft, ArrowUpRight, OctagonX } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  appointmentId: string;
  customerPhone?: string | null;
  scheduledDate?: string | null;
}

type LogRow = AppointmentSmsTimelineRow;

const TYPE_LABEL: Record<string, string> = {
  confirmation: "Confirmation",
  reschedule: "Reschedule",
  cancellation: "Cancellation",
  reminder: "Reminder",
  opt_out: "STOP received",
  opt_in: "START received",
  reply: "Reply",
};

const statusColor = (s: string) =>
  s === "sent" || s === "received"
    ? "default"
    : s === "failed"
      ? "destructive"
      : "secondary";

export function AppointmentSmsTimeline({ appointmentId, customerPhone, scheduledDate }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["sms-timeline", appointmentId, customerPhone, scheduledDate],
    queryFn: (): Promise<LogRow[]> =>
      fetchAppointmentSmsTimeline({ appointmentId, customerPhone, scheduledDate }),
    enabled: Boolean(appointmentId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> SMS timeline
        </CardTitle>
        <CardDescription>
          Every text message tied to this appointment. If older logs were not linked, matching messages for the customer phone are shown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No SMS messages yet for this appointment.
          </p>
        ) : (
          <ol className="relative border-l ml-2 space-y-4">
            {data.map((row) => {
              const isInbound = row.direction === "inbound";
              const Icon = row.message_type === "opt_out"
                ? OctagonX
                : isInbound
                  ? ArrowDownLeft
                  : ArrowUpRight;
              return (
                <li key={row.id} className="ml-4">
                  <span className="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-md bg-background border">
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {TYPE_LABEL[row.message_type ?? ""] ??
                        (isInbound ? "Inbound" : "Outbound")}
                    </span>
                    <Badge variant={statusColor(row.status) as never}>
                      {row.status}
                    </Badge>
                    {row.to_number_last4 && (
                      <span className="text-xs text-muted-foreground">
                        ••• {row.to_number_last4}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(row.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  {row.message_body && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {row.message_body}
                    </p>
                  )}
                  {row.error_message && (
                    <p className="text-xs text-destructive mt-1">
                      {row.error_message}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
