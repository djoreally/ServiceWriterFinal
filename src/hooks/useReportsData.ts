import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchReportPayments,
  fetchReportServices,
  fetchReportAppointments,
  fetchReportCustomers,
  fetchReportVehicles,
  fetchPreviousPeriodPayments,
  fetchYtdPayments,
  fetchActiveTechnicians,
  fetchTechnicianAppointmentsForPerformance,
  fetchRollingServices,
  fetchRollingAppointments,
} from "@/application/queries/reports.query";
import { format, subDays, startOfYear } from "date-fns";
import { DateRange } from "react-day-picker";

// ── Types ──────────────────────────────────────────────────────────────
export interface ReportPayment {
  id: string;
  amount: number;
  created_at: string;
  status: string;
  customer_email?: string;
  customer_name?: string;
  refund_amount?: number;
  payment_type?: string;
  tax_amount?: number;
  platform_fee?: number;
  subtotal?: number;
  metadata?: Record<string, unknown> | null;
}

type ReportPaymentWithAppointment = ReportPayment & {
  appointments?: { status: string | null } | null;
};

export interface ReportService {
  id: string;
  service_type: string;
  total_cost: number;
  tax_amount?: number | null;
  discount_amount?: number | null;
  shop_supplies?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  service_date: string;
  status: string;
  customer?: { name: string } | null;
  vehicle?: { make: string; model: string; year: number } | null;
}

export interface ReportAppointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  guest_name?: string;
  guest_email?: string;
  estimated_cost?: number;
  customer_postal_code?: string | null;
  location_address?: string | null;
  duration_minutes?: number | null;
  assigned_technician_id?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  updated_at?: string | null;
  travel_time_minutes?: number | null;
  tax_amount?: number | null;
  customer_id?: string | null;
  customer?: { name: string; postal_code?: string } | null;
  vehicle?: { make: string; model: string; year: number } | null;
}

export interface ReportCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  lifetime_value?: number;
  total_services?: number;
  last_service_date?: string;
  customer_segment?: string;
  churn_risk?: string;
  average_order_value?: number;
  first_service_date?: string;
  visit_frequency_days?: number;
  days_since_last_service?: number;
}

export interface ReportVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  vin?: string;
  license_plate?: string;
  oil_type?: string;
  mileage?: number;
  engine?: string;
  customer?: { name: string } | null;
  updated_at?: string;
}

export interface ReportTechnician {
  id: string;
  name: string;
  status: string;
  skills: string[];
}

export interface ReportTechPerformance {
  technician_id: string;
  technician_name: string;
  jobs_completed: number;
  jobs_total: number;
  total_revenue: number;
  avg_duration_minutes: number;
  utilization_rate: number;
}

export interface ReportsData {
  payments: ReportPayment[];
  services: ReportService[];
  appointments: ReportAppointment[];
  ytdServices: ReportService[];
  ytdAppointments: ReportAppointment[];
  customers: ReportCustomer[];
  vehicles: ReportVehicle[];
  previousPeriodPayments: { id: string; amount: number; status: string }[];
  ytdPayments: { amount: number; status: string }[];
  techPerformance: ReportTechPerformance[];
  loading: boolean;
}

export function useReportsData(dateRange: DateRange | undefined): ReportsData {
  const [payments, setPayments] = useState<ReportPayment[]>([]);
  const [services, setServices] = useState<ReportService[]>([]);
  const [appointments, setAppointments] = useState<ReportAppointment[]>([]);
  const [ytdServices, setYtdServices] = useState<ReportService[]>([]);
  const [ytdAppointments, setYtdAppointments] = useState<ReportAppointment[]>([]);
  const [customers, setCustomers] = useState<ReportCustomer[]>([]);
  const [vehicles, setVehicles] = useState<ReportVehicle[]>([]);
  const [previousPeriodPayments, setPreviousPeriodPayments] = useState<{ id: string; amount: number; status: string }[]>([]);
  const [ytdPayments, setYtdPayments] = useState<{ amount: number; status: string }[]>([]);
  const [techPerformance, setTechPerformance] = useState<ReportTechPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setLoading(true);

    try {
      const fromDate = format(dateRange.from, "yyyy-MM-dd");
      const toDate = format(dateRange.to, "yyyy-MM-dd");
      const periodDays = Math.ceil(
        (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)
      );
      const prevFrom = format(subDays(dateRange.from, periodDays), "yyyy-MM-dd");
      const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
      const ytdFrom = format(startOfYear(new Date()), "yyyy-MM-dd");
      const geoFrom = format(subDays(dateRange.to, 365), "yyyy-MM-dd");

      // ⚡ All queries run in parallel via Promise.all
      const [
        paymentsResult,
        servicesResult,
        appointmentsResult,
        customersResult,
        vehiclesResult,
        prevPaymentsResult,
        ytdPaymentsResult,
        techniciansResult,
        techAppointmentsResult,
        ytdServicesResult,
        ytdAppointmentsResult,
      ] = await Promise.allSettled([
        fetchReportPayments(fromDate, toDate),
        fetchReportServices(fromDate, toDate),
        fetchReportAppointments(fromDate, toDate),
        fetchReportCustomers(),
        fetchReportVehicles(),
        fetchPreviousPeriodPayments(prevFrom, prevTo),
        fetchYtdPayments(ytdFrom),
        fetchActiveTechnicians(),
        fetchTechnicianAppointmentsForPerformance(fromDate, toDate),
        fetchRollingServices(geoFrom, toDate, 2000),
        fetchRollingAppointments(geoFrom, toDate, 2000),
      ]);

      const getData = <T,>(
        result: PromiseSettledResult<{ data: unknown; error: unknown }>,
        label: string,
        fallback: T,
      ): T => {
        if (result.status !== "fulfilled") {
          console.error(`[reports] Failed to fetch ${label}:`, result.reason);
          return fallback;
        }
        if (result.value.error) {
          console.error(`[reports] Query error for ${label}:`, result.value.error);
          return fallback;
        }
        return (result.value.data ?? fallback) as T;
      };

      const paymentsRes = getData<ReportPaymentWithAppointment[]>(paymentsResult, "payments", []);
      const servicesRes = getData<ReportService[]>(servicesResult, "services", []);
      const appointmentsRes = getData<ReportAppointment[]>(appointmentsResult, "appointments", []);
      const customersRes = getData<ReportCustomer[]>(customersResult, "customers", []);
      const vehiclesRes = getData<ReportVehicle[]>(vehiclesResult, "vehicles", []);
      const prevPaymentsRes = getData<{ id: string; amount: number; status: string }[]>(
        prevPaymentsResult,
        "previous period payments",
        [],
      );
      const ytdPaymentsRes = getData<{ amount: number; status: string }[]>(
        ytdPaymentsResult,
        "ytd payments",
        [],
      );
      const techniciansRes = getData<ReportTechnician[]>(techniciansResult, "technicians", []);
      const techAppointmentsRes = getData<
        Array<{
          id: string;
          assigned_technician_id: string;
          status: string;
          estimated_cost?: number | null;
          estimated_duration_minutes?: number | null;
          actual_start_time?: string | null;
          actual_end_time?: string | null;
        }>
      >(techAppointmentsResult, "technician appointments", []);
      const ytdServicesRes = getData<ReportService[]>(ytdServicesResult, "rolling services", []);
      const ytdAppointmentsRes = getData<ReportAppointment[]>(ytdAppointmentsResult, "rolling appointments", []);

      // ⚡ Filter out pending payments linked to cancelled appointments
      const cleanPayments = paymentsRes.filter(
        (payment) => !(payment.status === "pending" && payment.appointments?.status === "cancelled"),
      );
      setPayments(cleanPayments);
      setServices(servicesRes);
      setAppointments(appointmentsRes);
      setCustomers(customersRes || []);
      setVehicles(vehiclesRes);
      setPreviousPeriodPayments(prevPaymentsRes || []);
      setYtdPayments(ytdPaymentsRes || []);
      setYtdServices(ytdServicesRes);
      setYtdAppointments(ytdAppointmentsRes);

      // Compute technician performance metrics
      const techs = techniciansRes;
      const techAppts = techAppointmentsRes;

      const perfMap = new Map<string, ReportTechPerformance>();
      for (const tech of techs) {
        perfMap.set(tech.id, {
          technician_id: tech.id,
          technician_name: tech.name,
          jobs_completed: 0,
          jobs_total: 0,
          total_revenue: 0,
          avg_duration_minutes: 0,
          utilization_rate: 0,
        });
      }

      const durationSums = new Map<string, number[]>();
      for (const appt of techAppts) {
        const perf = perfMap.get(appt.assigned_technician_id);
        if (!perf) continue;
        perf.jobs_total++;
        if (appt.status === "completed") {
          perf.jobs_completed++;
          perf.total_revenue += Number(appt.estimated_cost || 0);
          if (appt.actual_start_time && appt.actual_end_time) {
            const dur = (new Date(appt.actual_end_time).getTime() - new Date(appt.actual_start_time).getTime()) / 60000;
            if (dur > 0) {
              if (!durationSums.has(appt.assigned_technician_id)) durationSums.set(appt.assigned_technician_id, []);
              durationSums.get(appt.assigned_technician_id)!.push(dur);
            }
          } else if (appt.estimated_duration_minutes) {
            if (!durationSums.has(appt.assigned_technician_id)) durationSums.set(appt.assigned_technician_id, []);
            durationSums.get(appt.assigned_technician_id)!.push(appt.estimated_duration_minutes);
          }
        }
      }

      const workingHoursPerDay = 8;
      for (const [techId, perf] of perfMap) {
        const durations = durationSums.get(techId) || [];
        perf.avg_duration_minutes = durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0;
        const totalMinutesWorked = durations.reduce((a, b) => a + b, 0);
        const totalAvailableMinutes = periodDays * workingHoursPerDay * 60;
        perf.utilization_rate = totalAvailableMinutes > 0
          ? Math.round((totalMinutesWorked / totalAvailableMinutes) * 100)
          : 0;
      }

      setTechPerformance(Array.from(perfMap.values()).sort((a, b) => b.jobs_completed - a.jobs_completed));
    } catch (error) {
      console.error("Error fetching reports data:", error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchData());
  }, [fetchData]);

  return {
    payments,
    services,
    appointments,
    ytdServices,
    ytdAppointments,
    customers,
    vehicles,
    previousPeriodPayments,
    ytdPayments,
    techPerformance,
    loading,
  };
}
