import { useState } from "react";
import { DateRange } from "react-day-picker";
import { DateRangePreset, getDateRangeFromPreset } from "@/components/dashboard/DateRangeFilter";

export type ReportsAnalyticsTab =
  | "revenue"
  | "geo"
  | "customer"
  | "vehicle"
  | "service"
  | "operational"
  | "payment"
  | "retention";

export function useReportsFilters(defaultTab: ReportsAnalyticsTab = "revenue") {
  const [activeTab, setActiveTab] = useState<ReportsAnalyticsTab>(defaultTab);
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("30d"));
  const [customerSearch, setCustomerSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [includeLegacyData, setIncludeLegacyData] = useState(false);

  return {
    activeTab,
    setActiveTab,
    preset,
    setPreset,
    dateRange,
    setDateRange,
    customerSearch,
    setCustomerSearch,
    vehicleSearch,
    setVehicleSearch,
    includeLegacyData,
    setIncludeLegacyData,
  };
}
