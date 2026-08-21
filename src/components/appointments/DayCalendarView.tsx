import { useMemo, useState } from "react";
import { Appointment } from "@/shared/types";
import { format, isSameDay, parseISO } from "date-fns";
import { CurbeeScheduleBoard, type ScheduleEvent, type ScheduleResource } from "@/components/schedule/CurbeeScheduleBoard";

interface DayCalendarViewProps {
  appointments: Appointment[];
  currentDate: Date;
  onAppointmentClick: (appointment: Appointment) => void;
  onTimeSlotClick: (date: Date) => void;
  onDateChange?: (date: Date) => void;
  businessHours?: { opening_time: string; closing_time: string } | null;
  resources?: ScheduleResource[];
  brand?: string;
  title?: string;
  subtitle?: string;
  primaryActionLabel?: string;
}

function parseHour(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value.split(":")[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function appointmentResourceId(appointment: Appointment, resources: ScheduleResource[]): string {
  if (appointment.assigned_van_id && resources.some((resource) => resource.id === appointment.assigned_van_id)) {
    return appointment.assigned_van_id;
  }
  if (appointment.assigned_van_id) return appointment.assigned_van_id;
  if (resources.length > 0) {
    const basis = appointment.service_catalog?.name || appointment.title || appointment.id;
    const index = Math.abs(Array.from(basis).reduce((sum, char) => sum + char.charCodeAt(0), 0)) % resources.length;
    return resources[index].id;
  }
  return "unassigned";
}

function fallbackResources(appointments: Appointment[]): ScheduleResource[] {
  const assigned = Array.from(new Set(appointments.map((appointment) => appointment.assigned_van_id).filter(Boolean) as string[]));
  if (assigned.length > 0) {
    return assigned.map((id, index) => ({ id, name: `Van ${index + 1}` }));
  }
  return [
    { id: "diagnostic", name: "Diagnostic Van" },
    { id: "oil-change", name: "Oil Change Van", subtitle: "Scheduled hours have been modified for this day" },
    { id: "tire", name: "Tire Van", subtitle: "Scheduled hours have been modified for this day" },
  ];
}

export const DayCalendarView = ({
  appointments,
  currentDate,
  onAppointmentClick,
  onTimeSlotClick,
  onDateChange,
  businessHours,
  resources,
  brand,
  title = "Mobile Service Schedule",
  subtitle = "View and update your mobile appointment schedule.",
  primaryActionLabel,
}: DayCalendarViewProps) => {
  const [search, setSearch] = useState("");
  const openingHour = Math.min(parseHour(businessHours?.opening_time, 6), 6);
  const closingHour = Math.max(parseHour(businessHours?.closing_time, 18), 18);

  const scheduleResources = useMemo(() => resources?.length ? resources : fallbackResources(appointments), [appointments, resources]);

  const visibleAppointments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return appointments.filter((appointment) => {
      if (!appointment.scheduled_date || !isSameDay(parseISO(appointment.scheduled_date), currentDate)) return false;
      if (!query) return true;
      return [
        appointment.title,
        appointment.customer?.name,
        appointment.guest_name,
        appointment.vehicle ? `${appointment.vehicle.year} ${appointment.vehicle.make} ${appointment.vehicle.model}` : null,
        appointment.location_address,
        appointment.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [appointments, currentDate, search]);

  const events: ScheduleEvent[] = visibleAppointments.map((appointment, index) => {
    const start = `${appointment.scheduled_date}T${appointment.scheduled_time || "08:00"}`;
    const customerName = appointment.customer?.name || appointment.guest_name || appointment.title;
    const vehicleLabel = appointment.vehicle
      ? `${appointment.vehicle.year} ${appointment.vehicle.make} ${appointment.vehicle.model}`
      : appointment.service_catalog?.name;
    return {
      id: appointment.id,
      resourceId: appointmentResourceId(appointment, scheduleResources),
      title: customerName,
      subtitle: vehicleLabel || appointment.title,
      address: appointment.location_address,
      start,
      durationMinutes: appointment.duration_minutes || 60,
      amountCents: appointment.estimated_cost != null ? Math.round(Number(appointment.estimated_cost) * 100) : null,
      status: appointment.status,
      color: (["blue", "yellow", "green", "cyan", "purple", "orange"] as const)[index % 6],
      onClick: () => onAppointmentClick(appointment),
    };
  });

  return (
    <CurbeeScheduleBoard
      brand={brand}
      title={title}
      subtitle={subtitle}
      date={currentDate}
      onDateChange={onDateChange ?? onTimeSlotClick}
      resources={scheduleResources}
      events={events}
      searchValue={search}
      onSearchChange={setSearch}
      primaryActionLabel={primaryActionLabel ?? "Modify Van Schedule"}
      onPrimaryAction={() => onTimeSlotClick(currentDate)}
      openingHour={openingHour}
      closingHour={closingHour}
    />
  );
};
