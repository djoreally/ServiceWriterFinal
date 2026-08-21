import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { fetchRegionalSettings, defaultRegionalSettings, type RegionalSettingsData } from "@/application/queries/regional-settings.query";
import { format, parseISO } from "date-fns";

export type RegionalSettings = RegionalSettingsData;

interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
];

interface TimezoneInfo {
  value: string;
  label: string;
  offset: string;
}

export const TIMEZONES: TimezoneInfo[] = [
  { value: "UTC", label: "UTC (GMT)", offset: "+00:00" },
  { value: "Africa/Accra", label: "Accra, Ghana", offset: "+00:00" },
  { value: "Africa/Lagos", label: "Lagos, Nigeria", offset: "+01:00" },
  { value: "Africa/Johannesburg", label: "Johannesburg, South Africa", offset: "+02:00" },
  { value: "Africa/Nairobi", label: "Nairobi, Kenya", offset: "+03:00" },
  { value: "Europe/London", label: "London, UK", offset: "+00:00" },
  { value: "Europe/Paris", label: "Paris, France", offset: "+01:00" },
  { value: "Europe/Berlin", label: "Berlin, Germany", offset: "+01:00" },
  { value: "America/New_York", label: "New York, USA", offset: "-05:00" },
  { value: "America/Chicago", label: "Chicago, USA", offset: "-06:00" },
  { value: "America/Los_Angeles", label: "Los Angeles, USA", offset: "-08:00" },
  { value: "Asia/Dubai", label: "Dubai, UAE", offset: "+04:00" },
  { value: "Asia/Singapore", label: "Singapore", offset: "+08:00" },
  { value: "Asia/Tokyo", label: "Tokyo, Japan", offset: "+09:00" },
  { value: "Australia/Sydney", label: "Sydney, Australia", offset: "+11:00" },
];

interface RegionalSettingsContextType {
  settings: RegionalSettings;
  setSettings: (settings: RegionalSettings) => void;
  formatDate: (date: string | Date | null | undefined, includeTime?: boolean) => string;
  formatTime: (time: string | null | undefined) => string;
  formatCurrency: (amount: number | null | undefined, fractionDigits?: number) => string;
  getCurrencySymbol: () => string;
  refetch: () => Promise<void>;
}

const DEFAULT_REGIONAL_CONTEXT: RegionalSettingsContextType = {
  settings: defaultRegionalSettings,
  setSettings: () => {},
  formatDate: () => "-",
  formatTime: () => "-",
  formatCurrency: () => "-",
  getCurrencySymbol: () => "$",
  refetch: async () => {},
};

const RegionalSettingsContext = createContext<RegionalSettingsContextType>(DEFAULT_REGIONAL_CONTEXT);

const convertToDateFnsFormat = (formatStr: string, includeTime: boolean): string => {
  let result = formatStr;
  result = result.replace("DD", "dd");
  result = result.replace("YYYY", "yyyy");
  result = result.replace("HH:mm", "HH:mm");
  result = result.replace("hh:mm A", "hh:mm a");
  if (!includeTime) {
    result = result.replace(" HH:mm", "").replace(" hh:mm a", "").replace(" hh:mm A", "");
  }
  return result;
};

export const RegionalSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<RegionalSettings>(defaultRegionalSettings);

  const fetchSettings = async () => {
    try {
      const result = await fetchRegionalSettings();
      setSettings(result);
    } catch (error) {
      // Regional preferences are not a startup gate. Defaults keep the shell
      // responsive while the backend recovers.
      console.warn("[RegionalSettingsProvider] using defaults:", error);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  const getCurrencySymbol = (): string => {
    const currency = CURRENCIES.find(c => c.code === settings.currency);
    return currency?.symbol || "$";
  };

  const formatDate = (date: string | Date | null | undefined, includeTime: boolean = false): string => {
    if (!date) return "-";
    try {
      const dateObj = typeof date === "string" ? parseISO(date) : date;
      const fnsFormat = convertToDateFnsFormat(settings.date_format, includeTime);
      return format(dateObj, fnsFormat);
    } catch {
      return "-";
    }
  };

  const formatTime = (time: string | null | undefined): string => {
    if (!time) return "-";
    try {
      const [hours, minutes] = time.split(":").map(Number);
      const dateObj = new Date();
      dateObj.setHours(hours, minutes, 0, 0);
      const use12h = settings.date_format.includes("hh") || settings.date_format.includes(" A") || settings.date_format.includes(" a");
      if (use12h) return format(dateObj, "h:mm a");
      return format(dateObj, "HH:mm");
    } catch {
      return time;
    }
  };

  const formatCurrency = (amount: number | null | undefined, fractionDigits = 2): string => {
    if (amount === null || amount === undefined) return "-";
    const symbol = getCurrencySymbol();
    return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`;
  };

  return (
    <RegionalSettingsContext.Provider
      value={{ settings, setSettings, formatDate, formatTime, formatCurrency, getCurrencySymbol, refetch: fetchSettings }}
    >
      {children}
    </RegionalSettingsContext.Provider>
  );
};

export const useRegionalSettings = () => {
  const context = useContext(RegionalSettingsContext);
  if (!context) {
    console.warn("useRegionalSettings used outside RegionalSettingsProvider — returning defaults");
    return DEFAULT_REGIONAL_CONTEXT;
  }
  return context;
};
