import { useState, useEffect, useCallback } from "react";
import { fetchCustomerAppointments } from "@/application/queries/customer-appointments.query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  CheckCircle,
  Loader2,
  RefreshCw,
  XCircle,
  MapPin,
} from "lucide-react";
import { format, parseISO, isFuture, isPast, isToday } from "date-fns";
import { RescheduleDialog } from "./RescheduleDialog";
import { CancelDialog } from "./CancelDialog";
import { AppointmentStatusTimeline } from "./AppointmentStatusTimeline";
import { UpcomingAppointmentWidget } from "./UpcomingAppointmentWidget";
import { formatMoney } from "@/lib/financialMath";

export interface CustomerAppointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  estimated_cost: number | null;
  guest_name: string | null;
  management_token: string | null;
  location_address: string | null;
  notes: string | null;
  description: string | null;
  payment_status: string | null;
  service_catalog: { name: string } | null;
  created_at?: string | null;
  assigned_at?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  completed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
  in_progress: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const canModifyAppointment = (status: string) =>
  status !== "cancelled" && status !== "completed" && status !== "in_progress";

interface Props {
  account: { id: string; email: string; full_name: string | null };
}

export function CustomerAppointmentsTab({ account }: Props) {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [subTab, setSubTab] = useState<"upcoming" | "past">("upcoming");
  const [rescheduleAppt, setRescheduleAppt] =
    useState<CustomerAppointment | null>(null);
  const [cancelAppt, setCancelAppt] = useState<CustomerAppointment | null>(
    null
  );

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    const data = await fetchCustomerAppointments(account.id);
    setAppointments(data as CustomerAppointment[]);
    setLoading(false);
  }, [account.id]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const upcoming = appointments.filter(
    (a) =>
      (isFuture(parseISO(a.scheduled_date)) ||
        isToday(parseISO(a.scheduled_date))) &&
      canModifyAppointment(a.status)
  );

  const past = appointments.filter(
    (a) =>
      (isPast(parseISO(a.scheduled_date)) &&
        !isToday(parseISO(a.scheduled_date))) ||
      a.status === "completed" ||
      a.status === "cancelled"
  );

  const nextUpcoming = [...upcoming].sort((a, b) => {
    const at = new Date(`${a.scheduled_date}T${a.scheduled_time}`).getTime();
    const bt = new Date(`${b.scheduled_date}T${b.scheduled_time}`).getTime();
    return at - bt;
  })[0];
  const renderCard = (appt: CustomerAppointment) => {
    const date = parseISO(appt.scheduled_date);
    const isUpcoming =
      (isFuture(date) || isToday(date)) && canModifyAppointment(appt.status);

    return (
      <Card key={appt.id} className="border-border/50">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={
                    STATUS_STYLES[appt.status] || STATUS_STYLES.confirmed
                  }
                >
                  {appt.status === "completed" && (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  )}
                  {appt.status === "cancelled" && (
                    <XCircle className="h-3 w-3 mr-1" />
                  )}
                  {appt.status === "in_progress" && (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  {appt.status.replace("_", " ")}
                </Badge>
                {appt.payment_status && (
                  <Badge variant="outline" className="text-xs">
                    {appt.payment_status === "paid"
                      ? "Paid"
                      : appt.payment_status}
                  </Badge>
                )}
              </div>

              <h3 className="font-semibold text-lg">
                {appt.service_catalog?.name || appt.title}
              </h3>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{format(date, "EEEE, MMMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {format(
                      parseISO(
                        `${appt.scheduled_date}T${appt.scheduled_time}`
                      ),
                      "h:mm a"
                    )}
                    {appt.duration_minutes > 0 &&
                      ` (${appt.duration_minutes} min)`}
                  </span>
                </div>
                {appt.location_address && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate max-w-[200px]">
                      {appt.location_address}
                    </span>
                  </div>
                )}
              </div>

              {(appt.description || appt.notes) && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {appt.description || appt.notes}
                </p>
              )}
            </div>

            <div className="text-right flex flex-col items-end gap-2">
              {appt.estimated_cost != null && (
                <span className="font-semibold text-lg">
                  ${formatMoney(appt.estimated_cost)}
                </span>
              )}
            </div>
          </div>

          {/* Status timeline */}
          <div className="mt-5 pt-4 border-t border-border/50">
            <AppointmentStatusTimeline
              status={appt.status}
              createdAt={appt.created_at}
              assignedAt={appt.assigned_at}
              actualStartTime={appt.actual_start_time}
              actualEndTime={appt.actual_end_time}
            />
          </div>

          {isUpcoming && appt.management_token && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRescheduleAppt(appt)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reschedule
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setCancelAppt(appt)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">
              {upcoming.length}
            </p>
            <p className="text-sm text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">
              {past.filter((a) => a.status === "completed").length}
            </p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{appointments.length}</p>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-gray-500">
              $
              {appointments
                .filter((a) => a.status === "completed")
                .reduce((sum, a) => sum + (a.estimated_cost || 0), 0)
                .toFixed(0)}
            </p>
            <p className="text-sm text-muted-foreground">Total Spent</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming / Past sub-tabs */}
      <Tabs
        value={subTab}
        onValueChange={(v) => setSubTab(v as "upcoming" | "past")}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="upcoming">
            Upcoming ({upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4">
          {upcoming.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="p-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">
                  No upcoming appointments
                </h3>
                <p className="text-muted-foreground">
                  Book a service to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {nextUpcoming && (
                <UpcomingAppointmentWidget appointment={nextUpcoming} />
              )}
              {upcoming.map(renderCard)}
            </>
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          {past.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="p-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No past appointments</h3>
                <p className="text-muted-foreground">
                  Your completed appointments will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            past.map(renderCard)
          )}
        </TabsContent>
      </Tabs>

      {/* Reschedule Dialog */}
      {rescheduleAppt && (
        <RescheduleDialog
          appointment={rescheduleAppt}
          open={!!rescheduleAppt}
          onClose={() => setRescheduleAppt(null)}
          onSuccess={() => {
            setRescheduleAppt(null);
            fetchAppointments();
          }}
        />
      )}

      {/* Cancel Dialog */}
      {cancelAppt && (
        <CancelDialog
          appointment={cancelAppt}
          open={!!cancelAppt}
          onClose={() => setCancelAppt(null)}
          onSuccess={() => {
            setCancelAppt(null);
            fetchAppointments();
          }}
        />
      )}
    </>
  );
}
