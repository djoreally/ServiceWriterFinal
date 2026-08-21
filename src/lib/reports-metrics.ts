export type ReportDateBasis = "service_date" | "scheduled_date" | "collected_at" | "created_at";

export interface ReportMetricDefinition {
  key: string;
  label: string;
  source: string;
  dateBasis: ReportDateBasis;
  formula: string;
  caveat?: string;
}

/** Canonical definitions used by the Reports UI and exports. */
export const REPORT_METRICS: ReportMetricDefinition[] = [
  { key: "net_collected", label: "Net collected", source: "cash_collection_receipts_v1", dateBasis: "collected_at", formula: "Successful collections minus refunds" },
  { key: "gross_billed", label: "Gross billed", source: "services", dateBasis: "service_date", formula: "Completed service total" },
  { key: "outstanding", label: "Outstanding A/R", source: "services", dateBasis: "service_date", formula: "Completed unpaid and partial balances" },
  { key: "refunds", label: "Refunds", source: "cash_collection_receipts_v1", dateBasis: "collected_at", formula: "Refunded payment amount" },
  { key: "tax_collected", label: "Tax collected", source: "cash_collection_receipts_v1", dateBasis: "collected_at", formula: "Receipt tax or payment pricing metadata", caveat: "Metadata fallback is monitored in Data Quality." },
  { key: "average_ticket", label: "Average ticket", source: "services", dateBasis: "service_date", formula: "Gross billed divided by completed jobs" },
  { key: "completion_rate", label: "Completion rate", source: "appointments", dateBasis: "scheduled_date", formula: "Completed appointments divided by scheduled appointments" },
  { key: "cancellation_rate", label: "Cancellation rate", source: "appointments", dateBasis: "scheduled_date", formula: "Cancelled appointments divided by scheduled appointments" },
  { key: "no_show_rate", label: "No-show rate", source: "appointments", dateBasis: "scheduled_date", formula: "No-show appointments divided by scheduled appointments" },
  { key: "repeat_rate", label: "Repeat rate", source: "customers and services", dateBasis: "service_date", formula: "Customers with two or more services divided by all customers" },
];

export const findReportMetric = (key: string) => REPORT_METRICS.find((metric) => metric.key === key);
