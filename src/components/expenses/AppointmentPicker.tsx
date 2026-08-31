import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchAppointmentPickerOption,
  searchAppointmentPickerOptions,
} from "@/application/queries/appointments.query";
import { useAuth } from "@packages/auth";
import { useDebounce } from "@/hooks/useDebounce";
import { format, parseISO } from "date-fns";
import { AppointmentStatus } from "@/lib/enums";

export interface AppointmentOption {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  customer_name: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, option?: AppointmentOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: AppointmentStatus.Scheduled, label: "Scheduled" },
  { value: AppointmentStatus.Confirmed, label: "Confirmed" },
  { value: AppointmentStatus.InProgress, label: "In progress" },
  { value: AppointmentStatus.Completed, label: "Completed" },
  { value: AppointmentStatus.Cancelled, label: "Cancelled" },
  { value: AppointmentStatus.NoShow, label: "No show" },
];

/**
 * Searchable dropdown for linking an expense to an appointment.
 * Supports free-text search across title and customer name, plus a status filter.
 */
export function AppointmentPicker({ value, onChange, disabled, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<AppointmentOption[]>([]);
  const [selected, setSelected] = useState<AppointmentOption | null>(null);
  const debounced = useDebounce(search, 200);
  const { session } = useAuth();

  // Hydrate the chosen label when value is set externally / on edit.
  useEffect(() => {
    if (!value) {
      void Promise.resolve().then(() => setSelected(null));
      return;
    }
    if (selected?.id === value) return;
    let cancelled = false;
    (async () => {
      const opt = await fetchAppointmentPickerOption(value);
      if (cancelled || !opt) return;
      setSelected(opt);
    })();
    return () => {
      cancelled = true;
    };
  }, [value, selected?.id]);

  // Load recent + search results when popover opens, query, or status filter changes.
  useEffect(() => {
    if (!open) return;
    const userId = session?.user?.id;
    if (!userId) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const results = await searchAppointmentPickerOptions({
        userId,
        status: statusFilter,
        query: debounced,
      });
      if (cancelled) return;
      setOptions(results);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debounced, statusFilter, session?.user?.id]);


  const label = useMemo(() => {
    if (!selected) return placeholder ?? "Select an appointment";
    const date = selected.scheduled_date
      ? format(parseISO(selected.scheduled_date), "MMM d")
      : "Unscheduled";
    const customer = selected.customer_name ? ` · ${selected.customer_name}` : "";
    return `${selected.title ?? "Appointment"} · ${date}${customer}`;
  }, [selected, placeholder]);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn(
              "h-9 flex-1 justify-between font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by title or customer name…"
              value={search}
              onValueChange={setSearch}
            />
            <div className="border-b px-2 py-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <CommandList>
              {loading && (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" /> Loading…
                </div>
              )}
              {!loading && options.length === 0 && (
                <CommandEmpty>No appointments found.</CommandEmpty>
              )}
              {!loading && options.length > 0 && (
                <CommandGroup heading={debounced.trim().length >= 2 ? "Results" : "Recent"}>
                  {options.map((opt) => {
                    const date = opt.scheduled_date
                      ? format(parseISO(opt.scheduled_date), "MMM d, yyyy")
                      : "Unscheduled";
                    const time = opt.scheduled_time ? ` ${opt.scheduled_time.slice(0, 5)}` : "";
                    return (
                      <CommandItem
                        key={opt.id}
                        value={opt.id}
                        onSelect={() => {
                          setSelected(opt);
                          onChange(opt.id, opt);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="flex items-start gap-2"
                      >
                        <Check
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            value === opt.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {opt.title ?? "Appointment"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {date}
                            {time}
                            {opt.customer_name ? ` · ${opt.customer_name}` : ""}
                            {opt.status ? ` · ${opt.status}` : ""}
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => {
            setSelected(null);
            onChange(null, null);
          }}
          aria-label="Clear appointment"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
