import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { centsToDollars, formatMoney, toCents } from "@/lib/financialMath";

interface ExportData {
  payments?: Array<{
    id: string;
    amount: number;
    created_at: string;
    status: string;
    customer_email?: string;
    customer_name?: string;
    refund_amount?: number;
  }>;
  services?: Array<{
    id: string;
    service_type: string;
    total_cost: number;
    service_date: string;
    status: string;
    customer?: { name: string };
    vehicle?: { make: string; model: string; year: number };
  }>;
  appointments?: Array<{
    id: string;
    title: string;
    scheduled_date: string;
    scheduled_time: string;
    status: string;
    guest_name?: string;
    guest_email?: string;
    estimated_cost?: number;
  }>;
  dateRange?: { from: Date; to: Date };
}

interface ExportReportsProps {
  data: ExportData;
}

function escapeCSV(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function ExportReports({ data }: ExportReportsProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const { formatCurrency } = useRegionalSettings();

  const dateRangeLabel = data.dateRange
    ? `${format(data.dateRange.from, "yyyy-MM-dd")}_to_${format(data.dateRange.to, "yyyy-MM-dd")}`
    : format(new Date(), "yyyy-MM-dd");

  const exportPayments = async () => {
    if (!data.payments?.length) {
      toast.error("No payment data to export");
      return;
    }

    setExporting("payments");
    try {
      const headers = ["Date", "Customer", "Email", "Amount", "Status", "Refund"];
      const rows = data.payments.map((p) => [
        escapeCSV(format(new Date(p.created_at), "yyyy-MM-dd HH:mm")),
        escapeCSV(p.customer_name),
        escapeCSV(p.customer_email),
        escapeCSV(formatMoney(centsToDollars(toCents(p.amount)))),
        escapeCSV(p.status),
        escapeCSV(p.refund_amount ? formatMoney(centsToDollars(toCents(p.refund_amount))) : ""),
      ]);

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      downloadCSV(`payments_${dateRangeLabel}.csv`, csv);
      toast.success("Payment report exported");
    } finally {
      setExporting(null);
    }
  };

  const exportServices = async () => {
    if (!data.services?.length) {
      toast.error("No service data to export");
      return;
    }

    setExporting("services");
    try {
      const headers = ["Date", "Service Type", "Customer", "Vehicle", "Total Cost", "Status"];
      const rows = data.services.map((s) => [
        escapeCSV(format(new Date(s.service_date), "yyyy-MM-dd")),
        escapeCSV(s.service_type),
        escapeCSV(s.customer?.name),
        escapeCSV(
          s.vehicle ? `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model}` : ""
        ),
        escapeCSV(formatMoney(Number(s.total_cost))),
        escapeCSV(s.status),
      ]);

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      downloadCSV(`services_${dateRangeLabel}.csv`, csv);
      toast.success("Service report exported");
    } finally {
      setExporting(null);
    }
  };

  const exportAppointments = async () => {
    if (!data.appointments?.length) {
      toast.error("No appointment data to export");
      return;
    }

    setExporting("appointments");
    try {
      const headers = ["Date", "Time", "Title", "Customer", "Email", "Est. Cost", "Status"];
      const rows = data.appointments.map((a) => [
        escapeCSV(a.scheduled_date),
        escapeCSV(a.scheduled_time),
        escapeCSV(a.title),
        escapeCSV(a.guest_name),
        escapeCSV(a.guest_email),
        escapeCSV(a.estimated_cost ? formatMoney(Number(a.estimated_cost)) : ""),
        escapeCSV(a.status),
      ]);

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      downloadCSV(`appointments_${dateRangeLabel}.csv`, csv);
      toast.success("Appointment report exported");
    } finally {
      setExporting(null);
    }
  };

  const exportSummary = async () => {
    setExporting("summary");
    try {
      const settledPayments = (data.payments || [])
        .filter((p) => p.status === "succeeded" || p.status === "refunded");
      const grossCollectedCents = settledPayments
        .reduce((sum, p) => sum + p.amount, 0);
      const totalRefundsCents = settledPayments.reduce(
        (sum, p) => sum + (p.refund_amount || 0),
        0
      );
      const netCollectedCents = grossCollectedCents - totalRefundsCents;
      const totalServices = data.services?.length || 0;
      const totalAppointments = data.appointments?.length || 0;

      const servicesByType: Record<string, number> = {};
      (data.services || []).forEach((s) => {
        const type = s.service_type || "Other";
        servicesByType[type] = (servicesByType[type] || 0) + 1;
      });

      let csv = "Summary Report\n";
      csv += `Date Range,${dateRangeLabel.replace("_to_", " to ")}\n\n`;
      csv += "Financial Summary\n";
      csv += `Collected Cash (Gross),${formatMoney(centsToDollars(toCents(grossCollectedCents)))}\n`;
      csv += `Refunds,${formatMoney(centsToDollars(toCents(totalRefundsCents)))}\n`;
      csv += `Collected Cash (Net),${formatMoney(centsToDollars(toCents(netCollectedCents)))}\n\n`;
      csv += "Operations Summary\n";
      csv += `Total Services,${totalServices}\n`;
      csv += `Total Appointments,${totalAppointments}\n\n`;
      csv += "Services by Type\n";
      csv += "Service Type,Count\n";
      Object.entries(servicesByType).forEach(([type, count]) => {
        csv += `${escapeCSV(type)},${count}\n`;
      });

      downloadCSV(`summary_${dateRangeLabel}.csv`, csv);
      toast.success("Summary report exported");
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Export Reports</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportSummary} disabled={!!exporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Summary Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPayments} disabled={!!exporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Payments ({data.payments?.length || 0})
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportServices} disabled={!!exporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Services ({data.services?.length || 0})
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAppointments} disabled={!!exporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Appointments ({data.appointments?.length || 0})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
